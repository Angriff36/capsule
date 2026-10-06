import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { tppUploadApi, type Id } from "../../../lib/api";
import {
  collectImportFailures,
  diagnosticJson,
  importTimeout,
} from "./tppUploadDiagnostics";

export function TppImportReport({
  id,
  snapshot,
  failed,
}: {
  id: Id<"tppUploads"> | null;
  snapshot: () => Record<string, unknown>;
  failed: boolean;
}) {
  const convex = useConvex();
  const [pending, setPending] = useState(false),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setPending(false);
    setNotice("");
    return () => {
      generation.current++;
    };
  }, [id]);
  const download = async () => {
    const ticket = generation.current;
    setPending(true);
    setNotice("");
    const report: Record<string, unknown> = {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      ...JSON.parse(diagnosticJson(snapshot())),
      environment: {
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        path: location.pathname,
        browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      scope:
        "Browser activity for this session, source-export errors, and all available saved batch failures. Source records, document contents, credentials and signed URLs are excluded.",
    };
    let partial = false;
    try {
      if (id) {
        try {
          if (!navigator.onLine)
            throw new Error(
              "Browser is offline; server diagnostics could not be retrieved.",
            );
          const job = await importTimeout(
            convex.query(tppUploadApi.get, { id }),
            "Loading import status",
            10_000,
          );
          if (ticket !== generation.current) return;
          const metadata = JSON.parse(job.metadata);
          report.savedImport = {
            id: job._id,
            tenantId: job.tenantId,
            sourceAccount: job.sourceAccount,
            fileName: job.fileName,
            fileSize: job.fileSize,
            fingerprint: job.fingerprint,
            timeZone: job.timeZone,
            status: job.status,
            nextPart: job.nextPart,
            uploadedParts: job.uploadedParts,
            uploadedBytes: job.uploadedBytes,
            totalParts: job.totalParts,
            processingError: job.processingError,
            processorLeaseUntil: job.processorLeaseUntil,
            bytesReceived: job.bytesReceived,
            updatedAt: job.updatedAt,
            counts: JSON.parse(job.counts),
          };
          report.sourceExport = {
            status: metadata.manifest?.status,
            errors: metadata.manifest?.errors ?? [],
            counts: metadata.manifest?.counts,
          };
          report.savedDiagnostics = await collectImportFailures((cursor) =>
            convex.query(tppUploadApi.parts, {
              id,
              paginationOpts: { numItems: 200, cursor },
            }),
          );
          partial = !(report.savedDiagnostics as { complete: boolean })
            .complete;
        } catch (error) {
          partial = true;
          report.savedDiagnostics = {
            complete: false,
            collectionError:
              error instanceof Error ? error.message : String(error),
          };
        }
      } else
        report.savedDiagnostics = {
          complete: true,
          batches: [],
          failures: [],
          note: "No server import session had been created.",
        };
      if (ticket !== generation.current) return;
      report.serverDiagnosticsComplete = !partial;
      const url = URL.createObjectURL(
        new Blob([diagnosticJson(report)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `tpp-import-${failed ? "failure" : "report"}-${id ?? "local"}-${Date.now()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(
        partial
          ? "Report downloaded with local diagnostics. Some server diagnostics were unavailable; the report explains what is missing. Download again when connected for the full report."
          : "Report downloaded. You can attach this JSON file for troubleshooting.",
      );
    } catch (error) {
      if (ticket === generation.current)
        setNotice(
          `Report download failed: ${error instanceof Error ? error.message : String(error)}. Try again.`,
        );
    } finally {
      if (ticket === generation.current) setPending(false);
    }
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-link"
        disabled={pending}
        onClick={() => void download()}
      >
        {pending
          ? "Collecting diagnostic report…"
          : failed
            ? "Download failure report"
            : "Download import report"}
      </button>
      {notice && (
        <p role="status" className="text-sm text-ink-2">
          {notice}
        </p>
      )}
    </div>
  );
}
