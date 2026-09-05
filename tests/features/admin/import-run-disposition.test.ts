import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Wire test for the review-stage disposition surface (plan R2-5): the import
 * run detail page renders the workbook disposition roll-up the classification
 * action persists on the run row — including the unaccounted count that keeps
 * commit closed — so review-stage operators see what the completed badge does
 * and does not account for. Source-text assertions only (no render tests).
 */

const pagePath = resolve(
  __dirname,
  "../../../src/features/admin/import/ImportRunDetailPage.tsx",
);
const page = readFileSync(pagePath, "utf8");

describe("import run detail: workbook disposition surface", () => {
  it("renders disposition counts and the unaccounted-record gate", () => {
    // The roll-up is parsed from the run row like recordCounts.
    expect(page).toContain('importRun.dispositionCounts ?? "{}"');
    expect(page).toContain("importRun.unaccountedRecordCount ?? 0");

    // The review-stage card names every disposition of the taxonomy.
    expect(page).toContain("Workbook Dispositions");
    for (const label of [
      '"Normalized"',
      '"Linked reference"',
      '"Duplicate view"',
      '"Needs mapping"',
      '"Unsupported"',
      '"Invalid"',
    ]) {
      expect(page).toContain(label);
    }

    // The unaccounted count warns while it blocks commit.
    expect(page).toMatch(
      /Commit stays closed until every workbook is classified/,
    );
    expect(page).toContain("{unaccountedRecords} unaccounted");
    // It also appears in the run facts.
    expect(page).toContain("Unaccounted Records");

    // A completed badge never implies all source data became operational
    // records — the copy under the roll-up says so.
    expect(page).toMatch(/Dispositions describe the source archive/);
    expect(page).toMatch(/linked-reference content stays listed/);
    // Inventory without classification is an explicit state, not a blank.
    expect(page).toMatch(/workbooks are not classified yet/);
  });
});
