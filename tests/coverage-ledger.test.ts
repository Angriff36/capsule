/**
 * AC-167 (PR14-01): every acceptance row has a ledger entry with owners,
 * evidence, environment, commit, code state and gap, and the ledger follows
 * ACCEPTANCE_TESTS.md. AC-175 (PR14-09): the qualification report names every
 * open row with what it waits on and never claims "production ready" while a
 * row is open. AC-363: a PASS row must name the proof that ran.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REPORT_PATH,
  WAITS_ON,
  checkLedger,
  loadInputs,
  renderReport,
  type Ledger,
} from "../scripts/coverage-ledger";

const { ledger, rows, planOwners } = loadInputs();
const copy = (): Ledger => JSON.parse(JSON.stringify(ledger)) as Ledger;

describe("coverage ledger", () => {
  it("covers every acceptance row with a consistent, evidenced entry", () => {
    expect(rows.length).toBeGreaterThan(700);
    expect(checkLedger(ledger, rows, planOwners)).toEqual([]);
  });

  it(`${REPORT_PATH} is current (rebuild: bun scripts/coverage-ledger.ts)`, () => {
    expect(readFileSync(REPORT_PATH, "utf8")).toBe(renderReport(ledger));
  });

  it("catches a row marked PASS in the list but not in the ledger", () => {
    const open = rows.find((row) => row.status === "PENDING")!;
    const flipped = rows.map((row) =>
      row === open ? { ...row, status: "PASS" as const } : row,
    );
    expect(checkLedger(ledger, flipped, planOwners)).toContain(
      `${open.id}: ledger says PENDING, acceptance list says PASS (run bun scripts/coverage-ledger.ts)`,
    );
  });

  it("refuses a PASS row whose evidence names no proof", () => {
    const changed = copy();
    const entry = changed.criteria.find((c) => c.status === "PASS")!;
    entry.evidence = ["the page exists"];
    expect(checkLedger(changed, rows, planOwners)).toContain(
      `${entry.id}: PASS row names no test, script, review or receipt`,
    );
  });

  it("refuses an open row with no gap or an unknown reason", () => {
    const changed = copy();
    const entry = changed.criteria.find((c) => c.status === "PENDING")!;
    entry.gap = "";
    (entry as { waitsOn: string | null }).waitsOn = "someday";
    const problems = checkLedger(changed, rows, planOwners);
    expect(problems).toContain(`${entry.id}: open row with no gap`);
    expect(problems).toContain(`${entry.id}: unknown waitsOn "someday"`);
  });
});

describe("qualification report", () => {
  const report = renderReport(ledger);
  const open = ledger.criteria.filter((c) => c.status === "PENDING");

  it("says Capsule is not fully production ready while any row is open", () => {
    expect(open.length).toBeGreaterThan(0);
    expect(report).toContain("**Capsule is not fully production ready.**");
    expect(report).not.toMatch(/^All \d+ required rows are verified/m);
  });

  it("names open security findings, or says there are none", () => {
    expect(report).toMatch(
      /^(\*\*Open security findings:\*\* AC-\d+|Security findings: none open\. All \d+ sign-in)/m,
    );
    const changed = copy();
    const roleRow = changed.criteria.find((c) =>
      c.tasks.includes("PL-ROLE-PROOF"),
    )!;
    roleRow.status = "PENDING";
    expect(renderReport(changed)).toContain(
      `**Open security findings:** ${roleRow.id} `,
    );
  });

  it("lists every open row once, under what it waits on", () => {
    for (const entry of open) {
      const listed = report
        .split("\n")
        .filter((line) => line.startsWith(`| ${entry.id} |`));
      expect(listed, entry.id).toHaveLength(1);
      const section = report.slice(0, report.indexOf(listed[0]!));
      const heading = section.slice(section.lastIndexOf("## "));
      expect(heading, entry.id).toContain(
        entry.waitsOn ? WAITS_ON[entry.waitsOn] : "Open and buildable now",
      );
    }
  });

  it("only claims all verified when nothing is open", () => {
    const done = copy();
    for (const c of done.criteria) {
      c.status = "PASS";
      c.codeState = "verified";
      c.waitsOn = null;
    }
    expect(renderReport(done)).toContain(
      `All ${done.criteria.length} required rows are verified.`,
    );
  });
});
