import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../lib/api";

// Source provenance for one import run's archive (PR01-03): every workbook
// keeps its preserved original (checksum, sizes), and the parse-time evidence
// — cell coordinates, raw stored values, interpreted values, date system,
// timezone assumption, parser version. Raw evidence renders separately from
// the interpreted value; the panel self-hides while artifacts load or when
// the run has no archive inventory.

const DISPOSITION_LABELS: Record<string, string> = {
  pending: "Pending",
  normalized: "Normalized",
  linked_reference: "Linked reference",
  duplicate_view: "Duplicate view",
  needs_mapping: "Needs mapping",
  unsupported: "Unsupported",
  invalid: "Invalid",
};

const PARSE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  parsed: "Parsed",
  failed: "Failed",
};

interface ProvenanceCellRow {
  ref: string;
  raw: string;
  outcome: string;
  value?: string | number | boolean;
  unit: string | null;
  formula?: string;
  dateSystem?: string;
  mergedRange?: string;
}

interface ProvenanceWorkbook {
  parserVersion?: string;
  dateSystem?: string;
  timezoneAssumption?: string;
  macros?: string;
  sheetCount?: number;
  cellCount?: number;
  cellCap?: number;
  byteBudget?: number;
  cellsTruncated?: boolean;
  mergedRangesTruncated?: boolean;
  error?: string;
  sheets?: Array<{
    name: string;
    mergedRanges: string[];
    cells: ProvenanceCellRow[];
  }>;
}

interface ArtifactRow {
  _id: string;
  name: string;
  disposition: string;
  parseStatus: string;
  checksum: string | null;
  byteSize: number;
  entryCount: number;
  provenance: string;
}

/** Rendered cells per sheet — the artifact row keeps the full record. */
const RENDERED_CELL_LIMIT = 25;

function parseProvenance(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function cellText(value: string | number | boolean | undefined): string {
  return value === undefined ? "—" : String(value);
}

export function ImportProvenancePanel({
  importRunId,
}: {
  importRunId: Id<"importRuns">;
}) {
  const artifacts = useQuery(api.queries.listImportArtifactByImportRunId, {
    importRunId,
  }) as ArtifactRow[] | undefined;
  if (artifacts === undefined || artifacts.length === 0) return null;

  const sorted = [...artifacts].sort((a, b) => (a.name < b.name ? -1 : 1));

  return (
    <div className="card mt-4" data-testid="import-provenance-panel">
      <div className="border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
          Source Provenance
        </h2>
      </div>
      <div className="p-4">
        <p className="text-xs text-ink-3">
          Raw source evidence for every workbook: the preserved original
          (checksum, byte size), cell coordinates, raw stored values, and their
          interpretation under the parser version and date system recorded at
          parse time. Raw evidence stays separate from the interpreted value.
        </p>
        <div className="mt-4 divide-y divide-line">
          {sorted.map((artifact) => {
            const workbook = parseProvenance(artifact.provenance)[
              "workbook"
            ] as ProvenanceWorkbook | undefined;
            return (
              // DESIGN.md: the sheet is the only rounded surface — children are
              // separated by rules, not nested cards.
              <div key={artifact._id} className="pt-4 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                  <span className="font-medium font-mono text-ink">
                    {artifact.name}
                  </span>
                  <span className="text-ink-2">
                    {DISPOSITION_LABELS[artifact.disposition] ??
                      artifact.disposition}
                  </span>
                  <span className="text-ink-3">
                    parse{" "}
                    {PARSE_STATUS_LABELS[artifact.parseStatus] ??
                      artifact.parseStatus}
                  </span>
                  {artifact.checksum ? (
                    <span className="font-mono text-2xs text-ink-3">
                      sha256 {artifact.checksum.slice(0, 12)}…
                    </span>
                  ) : null}
                  <span className="text-ink-3">
                    {artifact.byteSize.toLocaleString()} bytes ·{" "}
                    {artifact.entryCount} entries
                  </span>
                </div>
                {workbook === undefined ? (
                  <p className="mt-2 text-xs text-ink-2">
                    Provenance not recorded yet — it records when the archive is
                    parsed.
                  </p>
                ) : workbook.error !== undefined ? (
                  <p className="mt-2 text-xs text-danger">
                    Workbook unreadable: {workbook.error}
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-ink-2">
                      Parser{" "}
                      <span className="font-mono">
                        {workbook.parserVersion}
                      </span>{" "}
                      · date system {workbook.dateSystem} ·{" "}
                      {workbook.timezoneAssumption} · macros {workbook.macros}
                    </p>
                    {workbook.sheets?.map((sheet) => {
                      const shown = sheet.cells.slice(0, RENDERED_CELL_LIMIT);
                      return (
                        <div key={sheet.name} className="mt-2">
                          <p className="text-xs font-medium text-ink">
                            {sheet.name}
                            {sheet.mergedRanges.length > 0
                              ? ` (merged: ${sheet.mergedRanges.join(", ")})`
                              : ""}
                          </p>
                          <div className="mt-1 overflow-x-auto">
                            <table className="w-full text-2xs">
                              <thead>
                                <tr className="text-left text-ink-3">
                                  <th className="py-1 pr-3 font-medium">
                                    Coordinate
                                  </th>
                                  <th className="py-1 pr-3 font-medium">
                                    Raw value
                                  </th>
                                  <th className="py-1 pr-3 font-medium">
                                    Normalized value
                                  </th>
                                  <th className="py-1 pr-3 font-medium">
                                    Outcome
                                  </th>
                                  <th className="py-1 font-medium">Unit</th>
                                </tr>
                              </thead>
                              <tbody className="font-mono text-ink-2">
                                {shown.map((cell) => (
                                  <tr
                                    key={cell.ref}
                                    className="border-t border-line"
                                  >
                                    <td className="py-1 pr-3">
                                      {sheet.name}!{cell.ref}
                                    </td>
                                    <td className="py-1 pr-3">
                                      {cell.raw === "" ? "—" : cell.raw}
                                    </td>
                                    <td className="py-1 pr-3">
                                      {cellText(cell.value)}
                                    </td>
                                    <td className="py-1 pr-3">
                                      {cell.outcome}
                                      {cell.dateSystem !== undefined
                                        ? ` (${cell.dateSystem})`
                                        : ""}
                                      {cell.formula !== undefined
                                        ? ` (${cell.formula})`
                                        : ""}
                                    </td>
                                    <td className="py-1">{cell.unit ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {sheet.cells.length > RENDERED_CELL_LIMIT ||
                          workbook.cellsTruncated ||
                          workbook.mergedRangesTruncated ? (
                            <p className="mt-1 text-2xs text-ink-3">
                              {sheet.cells.length > RENDERED_CELL_LIMIT
                                ? `+${sheet.cells.length - RENDERED_CELL_LIMIT} more cells recorded on the artifact. `
                                : ""}
                              {workbook.cellsTruncated
                                ? `Provenance caps at ${workbook.cellCap} cells / ${Math.round((workbook.byteBudget ?? 0) / 1024)} KiB of detail; this workbook has ${workbook.cellCount} cells.`
                                : ""}
                              {workbook.mergedRangesTruncated
                                ? " Some merged ranges are omitted."
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
