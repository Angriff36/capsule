import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on leftover import manifests", () => {
  it("keeps leftover import-manifest policy copy free of command jargon", () => {
    const files = [
      "src/import/import-run.manifest",
      "src/import/import-artifact.manifest",
      "src/import/external-record-link.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute import run commands",
      "execute import artifact commands",
      "execute external record link commands",
      "execute import conflict commands",
      "write import runs",
      "write import artifacts",
      "write external record links",
      "write import conflicts",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Staff may update imports",
      "Staff may change imports",
      "Staff may update imported files",
      "Staff may change imported files",
      "Staff may update import matches",
      "Staff may change import matches",
      "Staff may update import conflicts",
      "Staff may change import conflicts",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover import READ copy free of read jargon", () => {
    const files = [
      "src/import/import-run.manifest",
      "src/import/import-artifact.manifest",
      "src/import/external-record-link.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Staff may read import runs",
      "Staff may read import artifacts",
      "Staff may read external record links",
      "Staff may read import conflicts",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Staff may see imports",
      "Staff may see imported files",
      "Staff may see import matches",
      "Staff may see import conflicts",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    for (const landed of [
      "Staff may update imports",
      "Staff may update imported files",
      "Staff may update import matches",
      "Staff may update import conflicts",
    ]) {
      expect(visible).toContain(landed);
    }
  });

  it("keeps leftover import-screen copy free of import-run jargon", () => {
    const files = [
      "src/features/admin/import/ImportRunsListPage.tsx",
      "src/features/admin/import/ImportRunDetailPage.tsx",
      "src/features/admin/import/QuickFileImport.tsx",
      "src/features/admin/import/ParallelRunDashboardPage.tsx",
      "src/features/admin/AdminWorkspaceNav.tsx",
    ];
    // strip // comments and JSX {/* */} comments so developer notes are not
    // treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/\{\/\*[\s\S]*?\*\//g, " ");

    for (const old of [
      "Import Runs",
      "New import run",
      "Start New Import Run",
      "import run(s)",
      "No import runs found",
      "Create a new import run",
      "Import Run Workflow",
      "import run information",
      "stuck runs",
      "this run failed",
      "Import run not found",
      "Back to Import Runs",
      "Import Run Details",
      "Import Run Actions Guide",
      "Copy run ID",
      "internal run ID",
      "Recent Import Runs",
      '"Import runs"',
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Imports",
      "New import",
      "Start new import",
      "import(s)",
      "No imports found",
      "Start a new import.",
      "How an import works",
      "See the import details",
      "stuck imports",
      "Write why this import failed so the next attempt knows what went wrong.",
      "Import not found",
      "Back to imports",
      "Import details",
      "What you can do",
      "Copy import ID",
      "Copy the import ID for support",
      "Recent imports",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover import-dataset write copy free of write-dataset jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/import/import-dataset.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Staff may write import datasets");
    expect(visible).toContain("Staff may update import lists");
    expect(visible).toContain("Staff may see import lists");
    expectPlain("Staff may update import lists");
  });

  it("keeps leftover import-dataset READ copy free of read-dataset jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/import/import-dataset.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Staff may read import datasets");
    expect(visible).toContain("Staff may see import lists");
    expectPlain("Staff may see import lists");
    expect(visible).toContain("Staff may update import lists");
    expect(visible).toContain("Dataset category is required");
  });

  it("keeps leftover admin nav labels free of run and record jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/features/admin/AdminWorkspaceNav.tsx",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Parallel run");
    expect(visible).not.toContain("Reconcile records");

    for (const fresh of ["Compare with TPP", "Match leftover items"]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    expect(visible).toContain("/admin/parallel-run");
    expect(visible).toContain("/admin/reconcile");
  });

  it("keeps leftover compare and match page headings free of run and record jargon", () => {
    const files = [
      "src/features/admin/import/ParallelRunDashboardPage.tsx",
      "src/features/admin/import/ExternalRecordsReconcilePage.tsx",
    ];
    // strip // comments and JSX {/* */} comments so developer notes are not
    // treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/\{\/\*[\s\S]*?\*\//g, " ");

    for (const old of [
      "Parallel Run Dashboard",
      "Unresolved Mappings",
      "Record Counts Comparison",
      "Records still to match",
      "Imported records to match up",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Compare with TPP",
      "Not matched yet",
      "How the counts compare",
      "Still to match",
      "Match leftover items",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover compare and match table and body copy free of run and record jargon", () => {
    const files = [
      "src/features/admin/import/ParallelRunDashboardPage.tsx",
      "src/features/admin/import/ExternalRecordsReconcilePage.tsx",
    ];
    // strip // comments and JSX {/* */} comments so developer notes are not
    // treated as user copy; also join JSX text splits ({" "}) and line wraps
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/\{\/\*[\s\S]*?\*\//g, " ")
      .replace(/\s+/g, " ");

    for (const old of [
      "Imported records that still need",
      "Capsule record",
      "All mappings verified",
      "Unmapped",
      "unresolved mappings",
      "<th>Records</th>",
      "Understanding the Dashboard",
      "Imported records to",
      "individual records",
      '"run" : "runs"',
      "record(s) selected",
      "record(s) successfully",
      "Failed to verify records",
      "Failed to skip records",
      "Records marked",
      "Select multiple records",
      "Skipped during reconciliation",
      "during reconciliation",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Imported items that still need to be checked or matched up.",
      "In Capsule",
      "Everything is matched",
      "Not matched",
      "leftover items",
      "What these numbers mean",
      "Imported items to",
      "individual items",
      "Checked ",
      "Couldn't check those items.",
      "Couldn't skip those items.",
      "item(s) selected",
      "Items marked",
      "Select multiple items",
      "Skipped while matching leftover items",
      "Matched to a Capsule payment while matching leftover items",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    expect(visible).toContain(
      'formatCountNoun(unresolvedMappings.length, "item")',
    );
    expect(visible).not.toContain(
      'formatCountNoun(unresolvedMappings.length, "record")',
    );
    expect(visible).toContain("<th>Items</th>");
  });

  it("keeps leftover import records column and record-parse copy free of record jargon", () => {
    const files = [
      "src/features/admin/import/ImportRunsListPage.tsx",
      "src/features/admin/import/ImportRunDetailPage.tsx",
      "src/features/admin/import/QuickFileImport.tsx",
    ];
    // strip // comments and JSX {/* */} comments so developer notes are not
    // treated as user copy; also join JSX text splits ({" "}) and line wraps
    const raw = files.map((path) => readFileSync(path, "utf8")).join("\n");
    const visible = raw
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/\{\/\*[\s\S]*?\*\//g, " ")
      .replace(/<Link[^>]*>|<\/Link>/g, " ")
      .replace(/\{" "\}/g, " ")
      .replace(/\s+/g, " ");

    for (const old of [
      "Record Parse",
      ">Records</th>",
      "Record Parse Counts",
      "Record Counts (JSON)",
      "each record type parsed",
      "Confirm Final Record Counts",
      "Final record counts (JSON)",
      "Total Records",
      "Unaccounted Records",
      "Record Counts by Type",
      "operational records",
      "create the real records",
      "The records this import linked",
      "Invalid JSON format for record counts",
      "Records that need review",
      "reconcile queue",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Count items",
      ">Items</th>",
      "Item counts",
      "Enter how many of each kind of item were found in the file.",
      "Confirm final item counts",
      "Final item counts",
      "Total items",
      "Unaccounted items",
      "Item counts by type",
      "not live kitchen or office items",
      "create the real items",
      "The items this import linked are marked as replaced.",
      "Those counts aren't valid. Check the numbers and try again.",
      "Items that need review are in the leftover match list",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    expect(raw).toContain('to="/admin/reconcile"');
  });

  it("keeps leftover import match labels and compare help free of mapping jargon", () => {
    const files = [
      "src/features/admin/import/ImportRunDetailPage.tsx",
      "src/features/admin/import/ImportProvenancePanel.tsx",
      "src/features/admin/import/ParallelRunDashboardPage.tsx",
    ];
    // strip // comments and JSX {/* */} comments so developer notes are not
    // treated as user copy; also join JSX text splits ({" "}) and line wraps
    const raw = files.map((path) => readFileSync(path, "utf8")).join("\n");
    const visible = raw
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/\{\/\*[\s\S]*?\*\//g, " ")
      .replace(/<Link[^>]*>|<\/Link>/g, " ")
      .replace(/\{" "\}/g, " ")
      .replace(/\s+/g, " ");

    for (const old of [
      "Needs mapping",
      "matching queue",
      "link(s) superseded",
      "Drill-down",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Needs a match",
      "leftover match list",
      "match(es) marked as replaced.",
      "Look closer",
      'event_record: "Event"',
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // identifier comparisons stay raw — only user-facing labels change
    expect(raw).toContain('link.capsuleEntity === "event_record"');
    expect(raw).toContain("needs_mapping:");
  });
});
