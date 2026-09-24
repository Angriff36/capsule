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

describe("plain words on workforce UI", () => {
  it("keeps leftover My Day, Payroll, and Staff utilization copy free of record jargon", () => {
    const files = [
      "src/features/staff/MyDayPage.tsx",
      "src/features/finance/PayrollPrepareForm.tsx",
      "src/features/finance/PayrollExportPanel.tsx",
      "src/features/finance/payrollExport.ts",
      "src/features/workforce/StaffUtilizationPage.tsx",
    ];
    const visible = files.map((path) => readFileSync(path, "utf8")).join("\n");

    for (const old of [
      "No completed time records yet.",
      "No closed time records in this period",
      "closed time record",
      "Completed time records supply clocked hours.",
      'formatCountNoun(document.timeRecordCount, "time record")',
      "Close time records or finalize payroll inputs",
      "completed time record",
      "confirmed time records",
      "closed or corrected time records",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "No completed time entries yet.",
      "No closed time entries in this period — enter minutes manually.",
      'closed time ${clocked.recordCount === 1 ? "entry" : "entries"}',
      "Completed time entries supply clocked hours.",
      'formatCountNoun(document.timeRecordCount, "time entry", "time entries")',
      "Close time entries or finalize payroll inputs",
      'completed time ${entry.timeRecordCount === 1 ? "entry" : "entries"}',
      "confirmed time entries",
      "closed or corrected time entries wholly",
    ]) {
      expect(visible).toContain(fresh);
    }

    for (const phrase of [
      "No completed time entries yet.",
      "No closed time entries in this period — enter minutes manually.",
      "Completed time entries supply clocked hours.",
      "Close time entries or finalize payroll inputs",
      "confirmed time entries",
      "closed or corrected time entries wholly",
    ]) {
      expectPlain(phrase);
    }

    // later leftovers, unchanged
    expect(visible).toContain("<th>Recorded</th>");
    expect(visible).toContain("less recorded breaks");
  });

  it("keeps leftover TimeSheet copy free of record jargon", () => {
    const visible = readFileSync(
      "src/features/workforce/TimeSheetPage.tsx",
      "utf8",
    );
    // JSX reflows sentences across lines, so match on collapsed whitespace.
    const flat = visible.replace(/\s+/g, " ");

    for (const old of [
      "Correct this time record",
      "<h2>Time records</h2>",
      'formatCountNoun( activeRecords.length, "record"',
      'formatCountNoun(activeRecords.length, "record"',
      "Enter both times to record a finished window",
    ]) {
      expect(flat).not.toContain(old);
    }

    for (const fresh of [
      "Correct this time entry",
      "<h2>Time entries</h2>",
      'formatCountNoun( activeRecords.length, "time entry", "time entries", )',
      "Enter both times to save a finished window",
    ]) {
      expect(flat).toContain(fresh);
    }

    for (const phrase of [
      "Correct this time entry",
      "Time entries",
      "time entry",
      "Enter both times to save a finished window",
    ]) {
      expectPlain(phrase);
    }

    // later leftovers, unchanged
    expect(visible).toContain("No time has been recorded.");
    expect(visible).toContain(
      "Clock someone in to start their first time entry.",
    );
  });
});
