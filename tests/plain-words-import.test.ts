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
    expect(visible).toContain("Staff may read import datasets");
    expectPlain("Staff may update import lists");
  });
});
