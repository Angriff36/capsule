/**
 * The governed-writes gate (scripts/check-governed-writes.ts) refuses forged
 * manifestEvents rows and raw writes outside the documented exceptions, and
 * the repository passes it.
 */
import { describe, expect, it } from "vitest";
import {
  checkGovernedWrites,
  inspectSource,
} from "../scripts/check-governed-writes";

const exceptions = {
  invoiceNumberSequences: {
    reason: "counter",
    files: ["convex/lib/counter.ts"],
  },
};

function violations(file: string, source: string): string[] {
  return inspectSource(file, source, exceptions).violations.map(
    (v) => v.detail,
  );
}

describe("governed-writes gate", () => {
  it("refuses a hand-inserted manifestEvents row, even with a marker", () => {
    expect(
      violations(
        "convex/x.ts",
        `// raw-write: manifestEvents\nawait ctx.db.insert("manifestEvents", {});`,
      ),
    ).toEqual([
      "inserts into manifestEvents; emit the event from a Manifest command",
    ]);
  });

  it("refuses an unmarked patch and a write to a table with no exception", () => {
    expect(
      violations("convex/x.ts", "await ctx.db.patch(id, {});"),
    ).toHaveLength(1);
    expect(
      violations("convex/x.ts", `await ctx.db.insert("events", {});`)[0],
    ).toContain("events, which has no exception");
  });

  it("refuses an excepted table written from an unlisted file", () => {
    expect(
      violations(
        "convex/other.ts",
        `// raw-write: invoiceNumberSequences\nawait ctx.db.patch(id, {});`,
      )[0],
    ).toContain("not listed as a writer");
  });

  it("refuses a marker that disagrees with the inserted table", () => {
    expect(
      violations(
        "convex/lib/counter.ts",
        `// raw-write: invoiceNumberSequences\nawait ctx.db.insert("events", {});`,
      )[0],
    ).toContain("marker names invoiceNumberSequences");
  });

  it("accepts a marked write from a listed file", () => {
    const result = inspectSource(
      "convex/lib/counter.ts",
      `// raw-write: invoiceNumberSequences\nawait this.ctx.db.patch(row._id, {});`,
      exceptions,
    );
    expect(result.violations).toEqual([]);
    expect([...result.tables]).toEqual(["invoiceNumberSequences"]);
  });

  it("passes on the repository", () => {
    expect(checkGovernedWrites()).toEqual([]);
  });
});
