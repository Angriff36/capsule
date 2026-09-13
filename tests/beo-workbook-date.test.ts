import { describe, expect, it } from "vitest";
import { buildStyledWorkbook } from "./proofs/zipFixture";
import { loadEventBundle } from "../src/lib/tppReports/loadEventBundle";

/**
 * Regression (cross-model review of fix/source-backed-operations-continuation):
 * the typed workbook grid prints a date-formatted Date cell as M/D/YYYY, and
 * the BEO parser used to accept only the raw Excel serial — so a real Excel
 * BEO lost its event date and the import plan came out empty. Both shapes
 * must read; anything else must stay unread rather than guessed.
 */
function beoWorkbook(dateCell: { v?: string; is?: string; s?: number }) {
  return Buffer.from(
    buildStyledWorkbook({
      sheetName: "BEO",
      numFmts: [{ id: 164, code: "m/d/yyyy" }],
      // s=0 → date format; s=1 → General (a bare serial prints as a number).
      xfNumFmtIds: [164, 0],
      cells: [
        { ref: "A1", is: "Banquet Event Order" },
        { ref: "A3", is: "Invoice #:" },
        { ref: "B3", is: "12345" },
        { ref: "A4", is: "Date:" },
        { ref: "B4", ...dateCell },
        { ref: "A5", is: "Event Time:" },
        { ref: "B5", is: "5:00 PM - 9:00 PM" },
      ],
    }),
  );
}

function eventDateOf(contents: Buffer) {
  const loaded = loadEventBundle([{ name: "beo.xlsx", contents }]);
  return {
    eventDate: loaded.bundle.header.eventDate,
    warnings: loaded.bundle.warnings ?? [],
  };
}

describe("BEO workbook Date cell", () => {
  it("reads a date-formatted cell (printed M/D/YYYY by the typed grid)", () => {
    const read = eventDateOf(beoWorkbook({ v: "44927", s: 0 }));
    expect(read.eventDate).toBe("2023-01-01");
    expect(read.warnings).not.toContain(
      "BEO: event date could not be read from the Date cell.",
    );
  });

  it("still reads a General-formatted Excel serial", () => {
    const read = eventDateOf(beoWorkbook({ v: "44927", s: 1 }));
    expect(read.eventDate).toBe("2023-01-01");
  });

  it("still reads a hand-typed M/D/YYYY string", () => {
    expect(eventDateOf(beoWorkbook({ is: "1/1/2023" })).eventDate).toBe(
      "2023-01-01",
    );
  });

  it("does not guess when the Date cell holds no date", () => {
    const read = eventDateOf(beoWorkbook({ is: "TBD" }));
    expect(read.eventDate).toBeUndefined();
    expect(read.warnings).toContain(
      "BEO: event date could not be read from the Date cell.",
    );
  });
});
