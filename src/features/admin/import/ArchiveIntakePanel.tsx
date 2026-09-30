// Report archive intake (PL-ARCHIVE). One button takes the old system's
// .zip of report workbooks through every archive stage: upload, list every
// file (with the old system's report list, when given), sort each file into
// exactly one outcome with every row counted, and note where each value came
// from. The import can't finish until every file is accounted for — which
// does not mean every row became a Capsule record.

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../lib/api";
import {
  useImportArtifactClassify,
  useImportRunExplainArchiveDiscrepancy,
} from "../../../lib/manifest-convex-react";
import { useActionPrompt } from "../../../ui/action-prompt";
import { useActionFailure, useActionNotice } from "../../../ui/action-result";
import {
  archiveFileResult,
  archiveRowText,
  parseIndexNames,
} from "./archiveFileOutcome";
import { importRunDetailPath } from "./importRoutes";

export interface ArchiveIntakeRun {
  _id: Id<"importRuns">;
  version: number;
  status: string;
  archiveStorageId?: string | null;
  archiveWorkbookCount?: number | null;
  indexWorkbookCount?: number | null;
  indexNameMismatch?: boolean | null;
  discrepancyExplained?: boolean | null;
  discrepancyNote?: string | null;
  unaccountedRecordCount?: number | null;
}

interface ArchiveFileRow {
  _id: string;
  name: string;
  version: number;
  disposition: string;
  totalRowCount: number;
  rowOutcomeCounts: string;
  provenance: string;
}

/** Statuses where the archive can still be sorted (mirrors the seams). */
const SORTABLE = new Set([
  "started",
  "parsing",
  "validating",
  "reviewing",
  "committing",
]);

function indexedAs(provenance: string): string | undefined {
  try {
    return (JSON.parse(provenance || "{}") as { indexed?: string }).indexed;
  } catch {
    return undefined;
  }
}

export function ArchiveIntakePanel({ run }: { run: ArchiveIntakeRun }) {
  const files = useQuery(api.queries.listImportArtifactByImportRunId, {
    importRunId: run._id,
  }) as ArchiveFileRow[] | undefined;
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const inventory = useAction(api.archiveInventory.inventoryArchive);
  const classify = useAction(api.archiveDisposition.classifyArchiveWorkbooks);
  const recordProvenance = useAction(
    api.archiveProvenance.recordArchiveProvenance,
  );
  const keepAsReference = useImportArtifactClassify();
  const explain = useImportRunExplainArchiveDiscrepancy();
  const { prompt, host } = useActionPrompt();
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  const [busy, setBusy] = useState<string | null>(null);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [indexText, setIndexText] = useState("");
  const [indexOnly, setIndexOnly] = useState<string[]>([]);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);

  const hasArchive = Boolean(run.archiveStorageId);
  const canUpload =
    !hasArchive && (run.status === "started" || run.status === "parsing");
  const canSort = hasArchive && SORTABLE.has(run.status);
  if (!hasArchive && !canUpload) return null;

  const work = async (key: string, task: () => Promise<string | null>) => {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      setNotice(await task());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  /** Sort every unsorted file and note where each value came from. */
  const sortFiles = async (): Promise<string> => {
    const sorted = await classify({ importRunId: run._id });
    await recordProvenance({ importRunId: run._id });
    return sorted.unaccountedRecordCount === 0
      ? "Every file is accounted for."
      : `${sorted.unaccountedRecordCount} file(s) still need sorting.`;
  };

  const readArchive = () =>
    work("read", async () => {
      if (!archiveFile) throw new Error("Pick the archive (.zip) first.");
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": archiveFile.type || "application/zip" },
        body: archiveFile,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const { storageId } = (await response.json()) as { storageId: string };
      const names = parseIndexNames(indexText);
      const result = await inventory({
        importRunId: run._id,
        storageId: storageId as Id<"_storage">,
        indexReportNames: names.length > 0 ? names : undefined,
      });
      if (result.status === "duplicate") {
        setDuplicateOf(result.priorImportRunId);
        return null;
      }
      setIndexOnly(result.reconciliation.indexOnly);
      const found = `Found ${result.workbooks.length} file(s) in the archive.`;
      return `${found} ${await sortFiles()}`;
    });

  const explainGap = async () => {
    const note = await prompt.askReason({
      title: "Explain the file count",
      description:
        "Say why the archive and the report list don't match, so the import can finish.",
      label: "Why they differ",
      placeholder: "The report list was made before the last 20 reports…",
      confirmLabel: "Save",
    });
    if (!note?.trim()) return;
    void work("explain", async () => {
      await explain({
        docId: run._id,
        version: run.version,
        note: note.trim(),
      });
      return "Saved. The import can finish once every file is accounted for.";
    });
  };

  const markReference = (file: ArchiveFileRow) =>
    work(`ref-${file._id}`, async () => {
      await keepAsReference({
        docId: file._id,
        version: file.version,
        disposition: "linked_reference",
      });
      await classify({ importRunId: run._id });
      return `${file.name} is kept as reference.`;
    });

  const sorted = [...(files ?? [])].sort((a, b) => (a.name < b.name ? -1 : 1));
  const unsorted = sorted.filter((file) => file.disposition === "pending");
  const unaccounted = run.unaccountedRecordCount ?? 0;
  const archiveCount = run.archiveWorkbookCount ?? 0;
  const indexCount = run.indexWorkbookCount ?? 0;
  const gap =
    hasArchive &&
    (archiveCount !== indexCount || run.indexNameMismatch === true);
  const notInList = sorted.filter(
    (file) => indexedAs(file.provenance) === "archive_only",
  );

  return (
    <section className="card mt-4" data-testid="archive-intake-panel">
      {host}
      <div className="border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
          Report archive
        </h2>
      </div>
      <div className="p-4 text-xs">
        {error ? (
          <p className="mb-3 text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-3 text-ok" role="status">
            {notice}
          </p>
        ) : null}
        {duplicateOf ? (
          <p className="mb-3 text-ink-2" role="status">
            These exact files were already brought in by{" "}
            <Link to={importRunDetailPath(duplicateOf)} className="text-brand">
              an earlier import
            </Link>
            . Nothing new was added.
          </p>
        ) : null}

        {canUpload ? (
          <div className="grid gap-3">
            <p className="text-ink-2">
              Upload the old system's report archive (.zip). Capsule lists every
              file in it, sorts each one, and counts every row. Nothing becomes
              a Capsule record until you commit.
            </p>
            <label className="grid gap-1">
              <span className="font-medium text-ink">Archive (.zip)</span>
              <input
                type="file"
                name="archiveFile"
                accept=".zip,application/zip"
                disabled={busy !== null}
                onChange={(event) =>
                  setArchiveFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <label className="grid gap-1">
              <span className="font-medium text-ink">
                Report list from the old system (optional)
              </span>
              <textarea
                name="indexNames"
                rows={4}
                value={indexText}
                onChange={(event) => setIndexText(event.target.value)}
                className="w-full rounded-sm border border-line px-3 py-2 font-mono"
                placeholder={
                  "One report file name per line, e.g.\nbeo-6014.xlsx"
                }
              />
            </label>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null || !archiveFile}
                onClick={() => void readArchive()}
              >
                {busy === "read" ? "Reading…" : "Read archive"}
              </button>
            </div>
          </div>
        ) : null}

        {hasArchive ? (
          <div className="grid gap-3">
            <p className={unaccounted > 0 ? "text-danger" : "text-ink-2"}>
              {archiveCount} file(s) in the archive.{" "}
              {unaccounted > 0
                ? `${unaccounted} not accounted for yet — the import can't finish until every file is sorted.`
                : "Every file is accounted for."}{" "}
              Accounted for does not mean every row became a Capsule record.
            </p>

            {gap ? (
              <div className="grid gap-2">
                <p className="text-ink">
                  The archive has {archiveCount} file(s); the report list names{" "}
                  {indexCount}.
                  {notInList.length > 0
                    ? ` Not in the list: ${notInList.map((file) => file.name).join(", ")}.`
                    : ""}
                  {indexOnly.length > 0
                    ? ` Listed but missing: ${indexOnly.join(", ")}.`
                    : ""}
                </p>
                {run.discrepancyExplained ? (
                  <p className="text-ink-2">
                    Explained: {run.discrepancyNote ?? "—"}
                  </p>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy !== null}
                      onClick={() => void explainGap()}
                    >
                      Explain the difference
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {canSort && (unsorted.length > 0 || unaccounted > 0) ? (
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy !== null}
                  onClick={() => void work("sort", sortFiles)}
                >
                  {busy === "sort" ? "Sorting…" : "Sort the remaining files"}
                </button>
              </div>
            ) : null}

            {sorted.length > 0 ? (
              <table className="w-full text-2xs">
                <thead>
                  <tr className="text-left text-ink-3">
                    <th className="py-1 pr-3 font-medium">File</th>
                    <th className="py-1 pr-3 font-medium">What happened</th>
                    <th className="py-1 pr-3 font-medium">Rows</th>
                    <th className="py-1 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((file) => (
                    <tr key={file._id} className="border-t border-line">
                      <td className="py-1 pr-3 font-mono">{file.name}</td>
                      <td className="py-1 pr-3">
                        {archiveFileResult(file.disposition)}
                      </td>
                      <td className="py-1 pr-3 text-ink-2">
                        {archiveRowText(
                          file.totalRowCount,
                          file.rowOutcomeCounts,
                        )}
                      </td>
                      <td className="py-1">
                        {canSort &&
                        (file.disposition === "unsupported" ||
                          file.disposition === "needs_mapping") ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy !== null}
                            onClick={() => void markReference(file)}
                          >
                            Keep as reference
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
