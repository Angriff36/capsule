import { useEffect, useRef, useState } from "react";
import {
  useAction,
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
import { importTimeout, uploadTppPart } from "./tppUploadDiagnostics";
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
              {part.collection} · batch {part.sequence + 1} · {part.rowCount}{" "}
              records
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
  const telemetry = useTppUploadTelemetry();
  const auth = useAuthStatus();
  const { organization } = useOrganization();
  const start = useMutation(tppUploadApi.start),
    uploadUrl = useMutation(tppUploadApi.uploadUrl),
    commit = useAction(tppUploadApi.commit),
    finish = useMutation(tppUploadApi.finish);
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
  const stop = () => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    abort.current?.abort();
    setBusy(false);
  };
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
          telemetry.update("preparing", {
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
          telemetry.update("preparing", {
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
                : `Importing ${data.collection}…`,
          );
          const url = await importTimeout(
            uploadUrl({ id: active._id }),
            "Obtaining an upload URL",
            undefined,
            abort.current?.signal,
          );
          if (ticket !== generation.current) return;
          telemetry.update("uploading");
          if (!abort.current) throw new Error("Upload controller is missing.");
          const storageId = await uploadTppPart(
            url,
            data.blob,
            abort.current.signal,
            (bytes) => {
              if (ticket === generation.current)
                telemetry.update("uploading", { sentBytes: bytes });
            },
          );
          if (ticket !== generation.current) return;
          telemetry.update("importing", { sentBytes: data.blob.size });
          const result = await importTimeout(
            commit({
              id: active._id,
              sequence: data.sequence,
              collection: data.collection,
              storageId: storageId as Id<"_storage">,
              checksum: data.checksum,
              byteSize: data.blob.size,
            }),
            "Importing the uploaded batch",
            undefined,
            abort.current.signal,
          );
          if (ticket !== generation.current) return;
          setCounts(JSON.parse(result.counts));
          job.current = {
            ...active,
            nextPart: result.nextPart,
            counts: result.counts,
            bytesReceived: active.bytesReceived + data.blob.size,
          };
          telemetry.update("preparing", {
            savedBatches: result.nextPart,
            savedBytes: job.current.bytesReceived,
          });
          w.postMessage({ type: "ack" });
        } else if (data.type === "done") {
          if (!job.current) throw new Error("Import session is missing.");
          telemetry.update("finalizing");
          setPhase("Checking that all source records have been received…");
          const status = await importTimeout(
            finish({
              id: job.current._id,
              parts: data.parts,
            }),
            "Confirming import completion",
            undefined,
            abort.current?.signal,
          );
          if (ticket !== generation.current) return;
          setPhase(
            status === "completed"
              ? "Import complete."
              : "Upload complete. Review the preserved records and mapping exceptions below.",
          );
          setBusy(false);
          setComplete(true);
          telemetry.update(status === "completed" ? "complete" : "exceptions");
          w.terminate();
          worker.current = null;
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
        savedBatches: active.nextPart,
        savedBytes: active.bytesReceived,
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
      activeWorker.postMessage({
        type: "upload",
        resumePart: active.nextPart,
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
    setPhase("Paused. Resume from the last saved batch when ready.");
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
          Large exports are read in small batches. Keep this page open while
          importing. If interrupted, select the same file to resume without
          duplicating completed records.
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
              onRetry={() => {
                if (file) select(file, true);
              }}
              retryAvailable={Boolean(file)}
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
