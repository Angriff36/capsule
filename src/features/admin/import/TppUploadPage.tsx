import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useConvex,
  usePaginatedQuery,
} from "convex/react";
import { useOrganization } from "@clerk/react";
import { Link } from "react-router-dom";
import { tppUploadApi, type Doc, type Id } from "../../../lib/api";
import { useAuthStatus } from "../../../lib/useAuthStatus";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";
import type { TppFileIndex } from "../../../lib/tppAccountFile";
import { useTppUploadTelemetry } from "./useTppUploadTelemetry";
import {
  importTimeout,
  uploadTppPart,
  retryImportTransfer,
} from "./tppUploadDiagnostics";
import { TppUploadStatus } from "./TppUploadStatus";
import { TppImportReport } from "./TppImportReport";

type Ready = {
  metadata: TppFileIndex["metadata"];
  fingerprint: string;
  rows: number;
  collections: Record<string, number>;
};
type Counts = Record<
  string,
  {
    read: number;
    imported: number;
    preserved: number;
    needs_mapping: number;
    existing: number;
  }
>;
const number = (n: number) => n.toLocaleString();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
function SourceParts({ id }: { id: Id<"tppUploads"> }) {
  const convex = useConvex();
  const { results, status, loadMore } = usePaginatedQuery(
    tppUploadApi.parts,
    { id },
    { initialNumItems: 25 },
  );
  const [error, setError] = useState<string | null>(null);
  const download = async (part: Doc<"tppUploadParts">) => {
    try {
      const url = await convex.query(tppUploadApi.sourceUrl, {
        partId: part._id,
      });
      if (!url) throw new Error("Source file is unavailable.");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${part.collection}-${part.sequence}.json`;
      a.rel = "noopener";
      a.target = "_blank";
      a.click();
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Saved source and exceptions</h2>
      <p className="text-sm text-ink-2">
        Every processed batch retains its original data. Download a batch to
        inspect fields that have not been mapped.
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {results.map((part) => {
        const details = JSON.parse(part.outcome) as {
          failures?: { id: string; message: string }[];
        };
        return (
          <details key={part._id} className="border-b border-line py-2">
            <summary>
              {part.collection} · batch {part.sequence + 1} ·{" "}
              {part.status === "queued"
                ? "uploaded; waiting to import"
                : `${part.rowCount} records processed`}
              {details.failures?.length
                ? ` · ${details.failures.length} exceptions`
                : ""}
            </summary>
            <button
              className="text-link my-2"
              onClick={() => void download(part)}
            >
              Download source batch
            </button>
            {details.failures?.map((failure, i) => (
              <p className="text-sm py-1" key={i}>
                Record {failure.id}: {failure.message}
              </p>
            ))}
          </details>
        );
      })}
      {status === "CanLoadMore" && (
        <button className="btn-ghost" onClick={() => loadMore(25)}>
          More batches
        </button>
      )}
      {status === "LoadingFirstPage" && (
        <p role="status">Loading saved batches…</p>
      )}
    </section>
  );
}
export function TppUploadPage() {
  const convex = useConvex();
  const telemetry = useTppUploadTelemetry();
  const auth = useAuthStatus();
  const { organization } = useOrganization();
  const start = useMutation(tppUploadApi.start),
    uploadUrl = useMutation(tppUploadApi.uploadUrl),
    enqueue = useMutation(tppUploadApi.enqueue),
    seal = useMutation(tppUploadApi.seal),
    resumeProcessing = useMutation(tppUploadApi.resumeProcessing);
  const recent = useQuery(tppUploadApi.recent, auth?.tenantId ? {} : "skip");
  const worker = useRef<Worker | null>(null),
    job = useRef<Doc<"tppUploads"> | null>(null),
    abort = useRef<AbortController | null>(null),
    generation = useRef(0);
  const [file, setFile] = useState<File | null>(null),
    [ready, setReady] = useState<Ready | null>(null),
    [phase, setPhase] = useState("Choose a downloaded TPP export."),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [counts, setCounts] = useState<Counts>({}),
    [readBytes, setReadBytes] = useState(0),
    [complete, setComplete] = useState(false);
  // Owner-confirmed source time zone; never infer TPP wall times from the
  // importing computer, which may be in a different region.
  const [timeZone, setTimeZone] = useState("America/Denver");
  const [viewId, setViewId] = useState<Id<"tppUploads"> | null>(null);
  const liveJob = useQuery(tppUploadApi.get, viewId ? { id: viewId } : "skip");
  const transfers = useRef(new Map<number, { size: number; sent: number }>());
  const transferProgress = () => {
    const rows = [...transfers.current.values()];
    telemetry.update("uploading", {
      activeUploads: rows.length,
      batchBytes: rows.reduce((s, r) => s + r.size, 0),
      sentBytes: rows.reduce((s, r) => s + r.sent, 0),
    });
  };
  const stop = () => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    abort.current?.abort();
    transfers.current.clear();
    setBusy(false);
  };
  useEffect(() => {
    if (
      !liveJob ||
      liveJob.tenantId !== auth?.tenantId ||
      (job.current && liveJob.version < job.current.version)
    )
      return;
    const previous = job.current;
    job.current = liveJob;
    setCounts(JSON.parse(liveJob.counts));
    const progressed =
      !previous ||
      liveJob.nextPart > previous.nextPart ||
      (liveJob.uploadedParts ?? 0) > (previous.uploadedParts ?? 0);
    const stage = worker.current
      ? telemetry.current.current.stage
      : liveJob.processingError
        ? "failed"
        : liveJob.status === "completed"
          ? "complete"
          : liveJob.status === "completed_with_exceptions"
            ? "exceptions"
            : liveJob.totalParts != null
              ? "importing"
              : telemetry.current.current.stage === "failed"
                ? "failed"
                : "paused";
    telemetry.update(
      stage,
      {
        savedBatches: liveJob.uploadedParts ?? liveJob.nextPart,
        savedBytes: liveJob.uploadedBytes ?? liveJob.bytesReceived,
        processedBatches: liveJob.nextPart,
      },
      progressed,
    );
    if (liveJob.processingError) {
      setError(
        `Server import stopped: ${liveJob.processingError}. Uploaded batches are saved.`,
      );
      if (!worker.current) setBusy(false);
    } else if (liveJob.status !== "uploading") {
      setComplete(true);
      setBusy(false);
      setPhase(
        liveJob.status === "completed"
          ? "Import complete."
          : "Import complete with mapping exceptions. Download the report for details.",
      );
    } else if (!worker.current && liveJob.totalParts != null) {
      setBusy(true);
      setPhase(
        "Upload saved. The server is importing in the background; you can close this tab.",
      );
    }
  }, [liveJob, auth?.tenantId]);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
      abort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    stop();
    job.current = null;
    setFile(null);
    setReady(null);
    setCounts({});
    setViewId(null);
    setComplete(false);
    setError(null);
    telemetry.reset();
    setPhase("Choose a downloaded TPP export.");
  }, [auth?.tenantId]);
  const select = (selected: File, resume = false) => {
    stop();
    if (!resume) {
      setViewId(null);
      job.current = null;
      telemetry.reset();
    }
    const ticket = generation.current;
    setFile(selected);
    setReady(null);
    setError(null);
    if (!resume) setCounts({});
    setComplete(false);
    setReadBytes(0);
    setBusy(true);
    setPhase("Checking the export…");
    telemetry.update("indexing", {
      attempt: telemetry.current.current.attempt + 1,
    });
    const failed = (e: unknown) => {
      if (ticket !== generation.current) return;
      setError(message(e));
      telemetry.fail(e);
      setPhase("Import stopped. Retry to resume saved progress.");
      stop();
    };
    let w: Worker;
    try {
      w = new Worker(new URL("./tppUpload.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (e) {
      failed(e);
      return;
    }
    worker.current = w;
    w.onerror = (e) => failed(new Error(e.message));
    w.onmessageerror = () =>
      failed(
        new Error(
          "Could not read the file worker's response. Retry the import.",
        ),
      );
    w.onmessage = async (event: MessageEvent) => {
      if (ticket !== generation.current) return;
      const data = event.data;
      try {
        if (data.type === "heartbeat") telemetry.heartbeat();
        else if (data.type === "preparing") {
          telemetry.update(transfers.current.size ? "uploading" : "preparing", {
            collection: data.collection,
            batch: data.sequence,
          });
          setPhase(`Preparing ${data.collection}…`);
        } else if (data.type === "indexing") {
          setReadBytes(data.bytes);
          telemetry.update("indexing");
        } else if (data.type === "ready") {
          setReady(data);
          setBusy(false);
          setPhase("Ready to import.");
          telemetry.update("ready");
          if (resume) void begin(data, selected, w);
        } else if (data.type === "error") {
          const failure = new Error(data.message);
          if (data.stack) failure.stack = data.stack;
          failed(failure);
        } else if (data.type === "part") {
          const active = job.current;
          if (!active) throw new Error("Import session is missing.");
          transfers.current.set(data.sequence, {
            size: data.blob.size,
            sent: 0,
          });
          telemetry.update("uploading", {
            batch: data.sequence,
            collection: data.collection,
            batchBytes: data.blob.size,
            sentBytes: 0,
          });
          setPhase(
            data.collection === "__provenance"
              ? "Saving source history…"
              : data.collection === "__packages_v1"
                ? "Creating inferred packages and packing defaults…"
                : `Uploading ${data.collection}; saved batches import in the background…`,
          );
          if (!abort.current) throw new Error("Upload controller is missing.");
          const signal = abort.current.signal;
          let stored: string | undefined;
          const result = await retryImportTransfer(
            async () => {
              if (!stored) {
                const url = await importTimeout(
                  uploadUrl({ id: active._id }),
                  "Obtaining an upload URL",
                  undefined,
                  signal,
                );
                if (signal.aborted)
                  throw new DOMException("Import paused", "AbortError");
                stored = await uploadTppPart(
                  url,
                  data.blob,
                  signal,
                  (bytes) => {
                    if (ticket === generation.current) {
                      transfers.current.set(data.sequence, {
                        size: data.blob.size,
                        sent: bytes,
                      });
                      transferProgress();
                    }
                  },
                );
              }
              return await importTimeout(
                enqueue({
                  id: active._id,
                  sequence: data.sequence,
                  collection: data.collection,
                  storageId: stored as Id<"_storage">,
                  checksum: data.checksum,
                  byteSize: data.blob.size,
                }),
                "Saving the upload receipt",
                undefined,
                signal,
              );
            },
            signal,
            (failure, attempt) => {
              telemetry.events.current.push({
                at: new Date().toISOString(),
                batch: data.sequence,
                retryAttempt: attempt,
                error: message(failure),
              });
              setPhase(
                `Retrying upload batch ${data.sequence + 1} (attempt ${attempt}/3); other uploads continue.`,
              );
            },
          );
          if (ticket !== generation.current) return;
          transfers.current.delete(data.sequence);
          transferProgress();
          if (result.version >= (job.current?.version ?? 0)) {
            job.current = result;
            setCounts(JSON.parse(result.counts));
            telemetry.update("uploading", {
              savedBatches: result.uploadedParts ?? result.nextPart,
              savedBytes: result.uploadedBytes ?? result.bytesReceived,
              processedBatches: result.nextPart,
            });
          }
          w.postMessage({ type: "ack", sequence: data.sequence });
        } else if (data.type === "done") {
          if (!job.current) throw new Error("Import session is missing.");
          telemetry.update("finalizing");
          setPhase("Checking that all source records have been received…");
          const saved = await importTimeout(
            seal({
              id: job.current._id,
              parts: data.parts,
            }),
            "Confirming import completion",
            undefined,
            abort.current?.signal,
          );
          if (ticket !== generation.current) return;
          w.terminate();
          worker.current = null;
          job.current = saved;
          setPhase(
            saved.status === "uploading"
              ? "Upload saved. The server continues importing even if you close this tab."
              : "Import complete. Review any mapping exceptions below.",
          );
          setBusy(saved.status === "uploading" && !saved.processingError);
          setComplete(saved.status !== "uploading");
          telemetry.update(
            saved.processingError
              ? "failed"
              : saved.status === "uploading"
                ? "importing"
                : saved.status === "completed"
                  ? "complete"
                  : "exceptions",
          );
        }
      } catch (e) {
        failed(e);
      }
    };
    w.postMessage({ type: "index", file: selected });
  };
  const begin = async (
    indexed = ready,
    selected = file,
    activeWorker = worker.current,
  ) => {
    if (
      !indexed ||
      !selected ||
      !auth?.tenantId ||
      !activeWorker ||
      telemetry.current.current.stage !== "ready"
    )
      return;
    setBusy(true);
    setError(null);
    setPhase("Starting import…");
    telemetry.update("starting");
    abort.current = new AbortController();
    const ticket = generation.current;
    try {
      const active = await importTimeout(
        start({
          tenantId: auth.tenantId,
          fingerprint: indexed.fingerprint,
          fileName: selected.name,
          fileSize: selected.size,
          metadata: JSON.stringify(indexed.metadata),
          timeZone,
        }),
        "Starting or resuming the import",
        undefined,
        abort.current.signal,
      );
      if (ticket !== generation.current) return;
      job.current = active;
      setTimeZone(active.timeZone);
      setViewId(active._id);
      setCounts(JSON.parse(active.counts));
      telemetry.update("preparing", {
        savedBatches: active.uploadedParts ?? active.nextPart,
        savedBytes: active.uploadedBytes ?? active.bytesReceived,
        processedBatches: active.nextPart,
      });
      if (active.status !== "uploading") {
        setPhase(
          "This exact export has already been imported into this organization.",
        );
        setBusy(false);
        setComplete(true);
        telemetry.update(
          active.status === "completed" ? "complete" : "exceptions",
        );
        activeWorker.terminate();
        worker.current = null;
        return;
      }
      await importTimeout(
        resumeProcessing({ id: active._id }),
        "Resuming server processing",
        undefined,
        abort.current.signal,
      );
      if (ticket !== generation.current) return;
      if (active.totalParts != null) {
        activeWorker.terminate();
        worker.current = null;
        telemetry.update("importing");
        setPhase(
          "Upload already saved. The server is importing in the background.",
        );
        return;
      }
      const received: number[] = [];
      let cursor: string | null = null;
      do {
        const page: {
          page: number[];
          isDone: boolean;
          continueCursor: string;
        } = await importTimeout(
          convex.query(tppUploadApi.received, {
            id: active._id,
            from: active.nextPart,
            paginationOpts: { numItems: 1000, cursor },
          }),
          "Reading saved upload receipts",
          undefined,
          abort.current.signal,
        );
        if (ticket !== generation.current) return;
        received.push(...page.page);
        if (page.isDone) break;
        cursor = page.continueCursor;
      } while (true);
      activeWorker.postMessage({
        type: "upload",
        resumePart: active.nextPart,
        received,
      });
    } catch (e) {
      if (ticket === generation.current) {
        setError(message(e));
        telemetry.fail(e);
        setPhase("Import stopped. Retry to resume saved progress.");
        stop();
      }
    }
  };
  const processed = Object.entries(counts)
    .filter(([collection]) => !collection.startsWith("__"))
    .reduce((sum, [, c]) => sum + c.read, 0);
  const issues = Object.values(counts).reduce(
    (sum, c) => sum + c.needs_mapping,
    0,
  );
  const preserved = Object.values(counts).reduce(
    (sum, c) => sum + c.preserved,
    0,
  );
  const pause = () => {
    stop();
    telemetry.update("paused", {}, false);
    setPhase("Uploads paused. Saved batches continue importing on the server.");
  };
  const retry = async () => {
    if (job.current?.totalParts != null) {
      try {
        await importTimeout(
          resumeProcessing({ id: job.current._id }),
          "Resuming the server import",
        );
        setError(null);
        setBusy(true);
        telemetry.update("importing");
      } catch (e) {
        setError(message(e));
        telemetry.fail(e);
      }
    } else if (file) select(file, true);
  };
  return (
    <div className="space-y-6">
      <AdminWorkspaceNav />
      <header>
        <Link className="text-link" to="/admin/imports">
          Imports
        </Link>
        <h1 className="text-3xl font-bold text-ink">Import TPP account</h1>
        <p className="text-ink-2">
          Upload the JSON export downloaded by TPP Brief into{" "}
          <strong>{organization?.name || "this organization"}</strong>.
        </p>
      </header>
      <section
        className="space-y-4 border-y border-line py-6"
        aria-label="Choose TPP export"
      >
        <label className="block">
          Downloaded account export
          <input
            className="block mt-2 max-w-full"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const selected = e.target.files?.[0];
              e.target.value = "";
              if (selected) select(selected);
            }}
          />
        </label>
        <p className="text-sm text-ink-3">
          Uploads run in parallel while the server imports saved batches. Keep
          this page open until the upload is saved; importing continues after
          you close it. Interrupted uploads resume without resending saved
          batches.
        </p>
        {file && (
          <p>
            {file.name} · {(file.size / 1024 ** 3).toFixed(2)} GB
          </p>
        )}
        {file && !ready && (
          <progress
            className="w-full"
            max={file.size}
            value={readBytes}
            aria-label="Checking export"
          />
        )}
        {ready && (
          <>
            <p>
              {number(ready.rows)} records across{" "}
              {Object.keys(ready.collections).length} collections · Source
              account:{" "}
              {String(ready.metadata.account.name ?? ready.metadata.account.id)}
            </p>
            {ready.metadata.manifest.status !== "complete" && (
              <p className="text-warning">
                TPP marked this export {ready.metadata.manifest.status}.
                Available records can still be imported; source download
                failures remain in the report.
              </p>
            )}
            <label className="block">
              Source time zone
              <input
                className="input block mt-1"
                value={timeZone}
                disabled={busy || complete}
                onChange={(e) => setTimeZone(e.target.value)}
              />
            </label>
            <p className="text-sm text-ink-3">
              Use the organization’s TPP time zone. This stays fixed when an
              import resumes.
            </p>
            <div className="flex gap-3">
              {!complete && (
                <button
                  className="btn-primary"
                  disabled={busy || !worker.current}
                  onClick={() => void begin()}
                >
                  Import into {organization?.name || "this organization"}
                </button>
              )}
            </div>
            <progress
              className="w-full"
              max={ready.rows || 1}
              value={processed}
              aria-label="Records processed"
            />
          </>
        )}
        <p role="status" aria-live="polite">
          {phase}
          {processed > 0 ? ` ${number(processed)} records processed.` : ""}
        </p>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {(file || viewId) && (
          <>
            <TppUploadStatus
              stats={telemetry.stats}
              now={telemetry.now}
              online={telemetry.online}
              busy={busy}
              issues={issues}
              preserved={preserved}
              onPause={pause}
              onRetry={() => void retry()}
              retryAvailable={Boolean(file || job.current?.totalParts != null)}
              background={Boolean(
                job.current?.totalParts != null && !worker.current,
              )}
            />
            {!file && telemetry.stats.stage === "paused" && (
              <p className="text-sm text-warning">
                Select the same export file above to resume this saved upload.
              </p>
            )}
            <TppImportReport
              id={viewId}
              failed={telemetry.stats.stage === "failed" || issues > 0}
              snapshot={() => ({
                telemetry: telemetry.current.current,
                activity: telemetry.events.current,
                browserFailures: telemetry.failures.current,
                currentError: error,
                file: file
                  ? {
                      name: file.name,
                      size: file.size,
                      lastModified: file.lastModified,
                    }
                  : null,
                fingerprint: ready?.fingerprint,
                sourceTimeZone: timeZone,
                counts,
                sourceExport: ready
                  ? {
                      status: ready.metadata.manifest.status,
                      errors: ready.metadata.manifest.errors ?? [],
                      counts: ready.metadata.manifest.counts,
                    }
                  : undefined,
                browserHistoryAvailable: telemetry.current.current.attempt > 0,
              })}
            />
          </>
        )}
      </section>
      {Object.keys(counts).length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-3">Import results</h2>
          <p className="text-sm text-ink-2 mb-3">
            Imported records are usable in Capsule. Preserved records remain in
            the source archive. Needs mapping means some or all native fields
            still require conversion.
          </p>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  {[
                    "Collection",
                    "Read",
                    "Imported",
                    "Already present",
                    "Preserved",
                    "Needs mapping",
                  ].map((t) => (
                    <th className="th" key={t}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(counts)
                  .filter(([name]) => name !== "__provenance")
                  .map(([name, c]) => (
                    <tr key={name}>
                      <th className="td text-left" scope="row">
                        {name === "__packages_v1" ? "Inferred packages" : name}
                      </th>
                      {[
                        c.read,
                        c.imported,
                        c.existing,
                        c.preserved,
                        c.needs_mapping,
                      ].map((n, i) => (
                        <td className="td text-right" key={i}>
                          {number(n)}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {viewId && <SourceParts id={viewId} />}
      <section>
        <h2 className="text-xl font-bold mb-3">Recent TPP uploads</h2>
        {recent?.length === 0 && (
          <p className="text-ink-3">
            No TPP account exports have been uploaded here.
          </p>
        )}
        {recent?.map((item) => (
          <div className="border-b border-line py-3" key={item._id}>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                stop();
                telemetry.reset();
                job.current = item;
                setFile(null);
                setReady(null);
                setError(null);
                setComplete(item.status !== "uploading");
                setTimeZone(item.timeZone);
                setCounts(JSON.parse(item.counts));
                setViewId(item._id);
                setPhase(
                  item.status === "uploading"
                    ? "Saved upload is incomplete. Select the same file to resume."
                    : item.status.replaceAll("_", " "),
                );
                telemetry.update(
                  item.status === "uploading"
                    ? "paused"
                    : item.status === "completed"
                      ? "complete"
                      : "exceptions",
                  {
                    savedBatches: item.nextPart,
                    savedBytes: item.bytesReceived,
                    startedAt: item.createdAt ?? Date.now(),
                    lastProgressAt: item.updatedAt ?? Date.now(),
                    updatedAt: item.updatedAt ?? Date.now(),
                  },
                  false,
                );
              }}
            >
              {item.fileName}
            </button>
            <p className="text-sm text-ink-3">
              {item.status === "uploading"
                ? "Not completed"
                : item.status.replaceAll("_", " ")}{" "}
              · {item.nextPart} saved batches
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
