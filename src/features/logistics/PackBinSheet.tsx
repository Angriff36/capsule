import { useState } from "react";
import { usePackListSetBinSheet } from "../../lib/manifest-convex-react";
import { packingItemDescription } from "../../lib/packingDisplay";
import { classifyCommandFailure } from "../events/CommandFailure";
import {
  BIN_COLORS,
  binColorSummary,
  binRows,
  linesWithoutBin,
  parseBinSheet,
  serializeBinSheet,
  updateBinMark,
  type BinColor,
  type BinMark,
} from "./packBins";

interface BinSheetLine {
  _id: string;
  description: string;
  binNumber?: number | null;
  excludedAt?: number | null;
}

export interface PackBinSheetProps {
  packList: {
    _id: string;
    version: number;
    binSheet?: string | null;
    status: string;
  };
  lines: BinSheetLine[];
}

/**
 * The bin sheet at the front of the pack list: which numbered bins go out,
 * the lid colour of each (where it goes onsite), what is in each bin, and on
 * the way back which bins hold dirty dishes.
 */
export function PackBinSheet({ packList, lines }: PackBinSheetProps) {
  const setBinSheet = usePackListSetBinSheet();
  const [busyBin, setBusyBin] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openBin, setOpenBin] = useState<number | null>(null);
  const marks = parseBinSheet(packList.binSheet);
  const rows = binRows(lines, marks);
  const notInBin = linesWithoutBin(lines);
  const cameBack = packList.status === "dispatched";
  const canEdit = packList.status !== "cancelled";

  const save = async (bin: number, change: Partial<Omit<BinMark, "bin">>) => {
    setBusyBin(bin);
    setMessage(null);
    try {
      await setBinSheet({
        docId: packList._id,
        version: packList.version,
        binSheet: serializeBinSheet(updateBinMark(marks, bin, change)),
      });
      setMessage(`Bin ${bin} saved.`);
    } catch (error) {
      setMessage(
        `Bin ${bin} was not saved: ${classifyCommandFailure(error).title}`,
      );
    } finally {
      setBusyBin(null);
    }
  };

  return (
    <section
      className="space-y-3 border-t border-line pt-4"
      aria-label="Bin sheet"
      data-testid="pack-bin-sheet"
    >
      <h2 className="text-lg font-semibold text-ink">Bin sheet</h2>
      {rows.length === 0 ? (
        <p className="text-base text-ink-3">
          No line is in a bin yet. Use "Bin" on a line to write the number of
          the bin it goes in.
        </p>
      ) : (
        <>
          <ul className="m-0 list-none space-y-1 p-0 text-base text-ink">
            {binColorSummary(rows).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-sm text-ink-3">
            When the truck is unloaded, stack the bins by lid colour and count
            them against this sheet before they go out to their places.
          </p>
          <ul className="m-0 list-none space-y-2 p-0">
            {rows.map((row) => (
              <li
                key={row.bin}
                className="space-y-1 rounded-sm border border-line-2 p-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-base text-ink">Bin {row.bin}</strong>
                  <span className="text-sm text-ink-3">
                    {row.lines.length}{" "}
                    {row.lines.length === 1 ? "item" : "items"}
                  </span>
                  {row.dirty ? (
                    <span className="text-sm font-medium text-danger">
                      Dirty dishes - to the dish room
                    </span>
                  ) : null}
                  <label className="ml-auto flex items-center gap-1 text-sm text-ink-2">
                    Lid
                    <select
                      className="input"
                      aria-label={`Lid colour for bin ${row.bin}`}
                      value={row.color ?? ""}
                      disabled={!canEdit || busyBin != null}
                      onChange={(event) =>
                        void save(row.bin, {
                          color: (event.target.value ||
                            null) as BinColor | null,
                        })
                      }
                    >
                      <option value="">No colour</option>
                      {BIN_COLORS.map((color) => (
                        <option key={color.value} value={color.value}>
                          {color.label} - {color.place}
                        </option>
                      ))}
                    </select>
                  </label>
                  {cameBack ? (
                    <label className="flex items-center gap-1 text-sm text-ink-2">
                      <input
                        type="checkbox"
                        checked={row.dirty}
                        disabled={busyBin != null}
                        onChange={(event) =>
                          void save(row.bin, { dirty: event.target.checked })
                        }
                      />
                      Dirty dishes
                    </label>
                  ) : null}
                  {row.lines.length > 0 ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-expanded={openBin === row.bin}
                      onClick={() =>
                        setOpenBin((current) =>
                          current === row.bin ? null : row.bin,
                        )
                      }
                    >
                      {openBin === row.bin ? "Hide items" : "What is in it"}
                    </button>
                  ) : null}
                </div>
                {openBin === row.bin ? (
                  <ul className="m-0 list-disc pl-5 text-sm text-ink-2">
                    {row.lines.map((line) => (
                      <li key={line._id}>
                        {packingItemDescription(line.description)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {notInBin.length > 0 && rows.length > 0 ? (
        <p className="text-sm text-ink-3">
          {notInBin.length} {notInBin.length === 1 ? "line has" : "lines have"}{" "}
          no bin number yet.
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-ink-2" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
