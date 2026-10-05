#!/usr/bin/env bun
/**
 * AC-167 / AC-175 (PR14-01, PR14-09): the coverage ledger and the
 * qualification report.
 *
 * The ledger (codex-plans/whole-spec-audit-2026-09-20/source-coverage.json)
 * keeps one entry per acceptance row: status, code state, plan item, owners,
 * evidence, environment, the commit the row was last recorded at, the gap and,
 * for an open row, what it waits on. ACCEPTANCE_TESTS.md stays the place where
 * a row is marked PASS; this script copies status, evidence, owners and commit
 * into the ledger and writes the report from it.
 *
 *   bun scripts/coverage-ledger.ts           refresh the ledger + write the report
 *   bun scripts/coverage-ledger.ts --check   list problems, exit 1 when any
 *
 * Code state and the "waits on" reason of an open row are judgments: they are
 * kept from the ledger and only checked here.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";

export const LEDGER_PATH =
  "codex-plans/whole-spec-audit-2026-09-20/source-coverage.json";
export const REPORT_PATH = "docs/product/qualification-report.md";
const ACCEPTANCE_PATH = "ACCEPTANCE_TESTS.md";
const PLAN_PATH = "IMPLEMENTATION_PLAN.md";

export const CODE_STATES = [
  "missing",
  "partial",
  "implemented-unverified",
  "configuration-blocked",
  "verified",
] as const;
export type CodeState = (typeof CODE_STATES)[number];

/** What an open row waits on, in plain words for the report. */
export const WAITS_ON = {
  "outside-account":
    "An outside account and its sign-in details (not in Capsule or the repository)",
  "owner-files":
    "Files or definitions only the owner has (old-system exports, report playbook, deliverables)",
  "no-money-rule":
    "Payment, payroll or accounting work, paused by Ryan on 2026-09-29",
  "builder-capability":
    "A capability the code generator does not have yet (signed provider address, check order)",
  people: "Real people: operator trials, owner review and sign-off",
  "production-box":
    "Work on the production server (backups, restore drill, release-time checks)",
  "loop-tools":
    "The automatic build tools themselves, which the product builder does not change",
} as const;
export type WaitsOn = keyof typeof WAITS_ON;

export interface LedgerCriterion {
  id: string;
  key: string;
  source: string;
  locator: string;
  status: "PASS" | "PENDING";
  codeState: CodeState;
  tasks: string[];
  owners: string[];
  gap: string;
  evidence: string[];
  environment: string;
  sha: string;
  waitsOn: WaitsOn | null;
  [extra: string]: unknown;
}

export interface Ledger {
  criteria: LedgerCriterion[];
  [extra: string]: unknown;
}

export interface AcceptanceRow {
  id: string;
  line: number;
  required: string;
  kind: string;
  status: "PASS" | "PENDING";
}

export function parseAcceptanceRows(md: string): AcceptanceRow[] {
  const rows: AcceptanceRow[] = [];
  md.split("\n").forEach((text, index) => {
    if (!/^\| AC-\d+ /.test(text)) return;
    const cells = text.split(" | ").map((cell) => cell.trim());
    const id = cells[0].replace(/^\|\s*/, "");
    const status = cells[cells.length - 1].replace(/\s*\|$/, "");
    rows.push({
      id,
      line: index + 1,
      required: cells[cells.length - 3] ?? "",
      kind: cells[cells.length - 2] ?? "",
      status: status.startsWith("PASS") ? "PASS" : "PENDING",
    });
  });
  return rows;
}

/**
 * Plan item id -> its "Owners/reuse" list. An item the plan only names (a
 * finished item whose line was folded into a validation note, like PL-BUILD)
 * maps to an empty list; its owners are kept in the ledger.
 */
export function parsePlanOwners(plan: string): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const [id] of plan.matchAll(/\bPL-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g))
    owners.set(id, []);
  for (const line of plan.split("\n")) {
    const item = line.match(/^- \[[ x]\] \*\*P\d · (PL-[A-Z0-9-]+)/);
    if (!item) continue;
    const list = line.match(/Owners\/reuse: `([^`]+)`/);
    owners.set(
      item[1],
      list
        ? list[1]
            .split(";")
            .map((owner) => owner.trim())
            .filter(Boolean)
        : [],
    );
  }
  return owners;
}

/** Where the row's proof ran, read from the recorded evidence. */
export function environmentFor(row: AcceptanceRow): string {
  if (row.status !== "PASS") return "Not verified yet";
  const text = row.required;
  const places: string[] = [];
  if (/tests\/|\.test\.tsx?|bun run|scripts\//.test(text))
    places.push("automated test in the repository (vitest / convex-test)");
  if (/browser|360 ?px|1280/i.test(text))
    places.push("signed-in browser on the local dev stack");
  if (/glm|grok|llm-review|judg|J review|J leg/i.test(text))
    places.push("model or human judgment of the real screen or document");
  if (/CI\b|ubuntu|actions\/runs/i.test(text)) places.push("Linux CI");
  return places.length
    ? places.join("; ")
    : "recorded document or review named in the evidence";
}

/** Line number -> commit that last changed it (uncommitted -> fallback). */
export function blameLines(fallback: string): Map<number, string> {
  const out = execFileSync("git", ["blame", "--porcelain", ACCEPTANCE_PATH], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const shas = new Map<number, string>();
  for (const line of out.split("\n")) {
    const header = line.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (!header) continue;
    const sha = /^0+$/.test(header[1]) ? fallback : header[1].slice(0, 8);
    shas.set(Number(header[2]), sha);
  }
  return shas;
}

export function syncLedger(
  ledger: Ledger,
  rows: AcceptanceRow[],
  planOwners: Map<string, string[]>,
  shaForLine: (line: number) => string,
): Ledger {
  const byId = new Map(ledger.criteria.map((c) => [c.id, c]));
  for (const row of rows) {
    const entry = byId.get(row.id);
    if (!entry) continue;
    // Notes gathered while a row was already verified (line numbers, the
    // screen that uses it) stay after the recorded proof; notes from while it
    // was open are dropped once it passes.
    const keptNotes =
      entry.status === "PASS"
        ? entry.evidence.filter((note) => note !== row.required)
        : [];
    entry.status = row.status;
    const fromPlan = [
      ...new Set(entry.tasks.flatMap((task) => planOwners.get(task) ?? [])),
    ];
    if (fromPlan.length) entry.owners = fromPlan;
    entry.environment = environmentFor(row);
    entry.sha = shaForLine(row.line);
    if (row.status === "PASS") {
      entry.codeState = "verified";
      entry.waitsOn = null;
      entry.evidence = [row.required, ...keptNotes];
      if (!entry.gap || !/^None known/.test(entry.gap))
        entry.gap = "None known; the evidence is the recorded proof.";
    } else {
      entry.waitsOn ??= null;
      if (entry.codeState === "verified") entry.codeState = "partial";
      if (row.required) entry.evidence = [row.required];
    }
  }
  return ledger;
}

const PROOF_NAMED =
  /tests\/|\.test\.tsx?|scripts\/|bun run|review|receipt|llm-review|judg/i;

export function checkLedger(
  ledger: Ledger,
  rows: AcceptanceRow[],
  planOwners: Map<string, string[]>,
): string[] {
  const problems: string[] = [];
  const rowIds = new Set(rows.map((row) => row.id));
  const byId = new Map(ledger.criteria.map((c) => [c.id, c]));
  for (const row of rows) {
    const entry = byId.get(row.id);
    if (!entry) {
      problems.push(`${row.id}: no ledger entry`);
      continue;
    }
    if (entry.status !== row.status)
      problems.push(
        `${row.id}: ledger says ${entry.status}, acceptance list says ${row.status} (run bun scripts/coverage-ledger.ts)`,
      );
  }
  for (const entry of ledger.criteria) {
    const where = entry.id;
    if (!rowIds.has(entry.id))
      problems.push(`${where}: not in the acceptance list`);
    if (!CODE_STATES.includes(entry.codeState))
      problems.push(`${where}: unknown code state "${entry.codeState}"`);
    if ((entry.status === "PASS") !== (entry.codeState === "verified"))
      problems.push(
        `${where}: ${entry.status} with code state ${entry.codeState}`,
      );
    if (!entry.tasks.length || entry.tasks.some((t) => !planOwners.has(t)))
      problems.push(`${where}: plan item missing (${entry.tasks.join(", ")})`);
    if (!entry.owners?.length) problems.push(`${where}: no owners`);
    if (!entry.evidence?.length || !entry.evidence[0])
      problems.push(`${where}: no evidence`);
    if (!entry.environment) problems.push(`${where}: no environment`);
    if (!/^[0-9a-f]{7,40}$/.test(entry.sha ?? ""))
      problems.push(`${where}: no commit`);
    if (entry.status === "PENDING") {
      if (!entry.gap || /^None known/.test(entry.gap))
        problems.push(`${where}: open row with no gap`);
      if (entry.waitsOn !== null && !(entry.waitsOn in WAITS_ON))
        problems.push(`${where}: unknown waitsOn "${String(entry.waitsOn)}"`);
    } else {
      if (entry.waitsOn !== null)
        problems.push(`${where}: PASS row still waits on ${entry.waitsOn}`);
      // AC-363: a row is not done because a schema, page or command exists;
      // its evidence must name the proof that ran.
      if (!PROOF_NAMED.test(entry.evidence?.[0] ?? ""))
        problems.push(
          `${where}: PASS row names no test, script, review or receipt`,
        );
    }
  }
  return problems;
}

/** Plan items whose rows are the security boundary (AC-175 names them). */
const SECURITY_ITEMS = [
  "PL-AUTH",
  "PL-SESSION-ACCESS",
  "PL-ROLE-PROOF",
  "PL-FILE-PRIVACY",
  "PL-PUBLIC-ACCESS",
];

export function renderReport(ledger: Ledger): string {
  const all = ledger.criteria;
  const open = all.filter((c) => c.status === "PENDING");
  const blocked = open.filter((c) => c.waitsOn);
  const buildable = open.filter((c) => !c.waitsOn);
  const states = CODE_STATES.map(
    (state) =>
      `| ${state} | ${all.filter((c) => c.codeState === state).length} |`,
  );
  const security = all.filter((c) =>
    c.tasks.some((task) => SECURITY_ITEMS.includes(task)),
  );
  const securityOpen = security.filter((c) => c.status === "PENDING");
  const lines = [
    "# Capsule qualification report",
    "",
    "Generated by `bun scripts/coverage-ledger.ts` from the coverage ledger",
    `(\`${LEDGER_PATH}\`), which follows ACCEPTANCE_TESTS.md. Do not edit by hand.`,
    "",
    open.length
      ? `**Capsule is not fully production ready.** ${open.length} of ${all.length} required rows are still open; ${blocked.length} of them wait on something outside the product builder's reach (below). Verified work stays verified: an open row only holds back the workflows named next to it.`
      : `All ${all.length} required rows are verified.`,
    "",
    securityOpen.length
      ? `**Open security findings:** ${securityOpen.map((c) => c.id).join(", ")} (sign-in, roles, company separation, files and public pages).`
      : `Security findings: none open. All ${security.length} sign-in, role, company-separation, file and public-page rows (${SECURITY_ITEMS.join(", ")}) are verified.`,
    "",
    "| Code state | Rows |",
    "| --- | --- |",
    ...states,
    "",
  ];
  const tasksOf = (rows: LedgerCriterion[]) =>
    [...new Set(rows.flatMap((c) => c.tasks))].join(", ");
  for (const [reason, words] of Object.entries(WAITS_ON)) {
    const rows = blocked.filter((c) => c.waitsOn === reason);
    if (!rows.length) continue;
    lines.push(
      `## Waits on: ${words}`,
      "",
      `Affected plan items: ${tasksOf(rows)}.`,
      "",
    );
    lines.push("| Row | Plan item | What is missing |", "| --- | --- | --- |");
    for (const c of rows)
      lines.push(
        `| ${c.id} | ${c.tasks.join(", ")} | ${c.gap.replace(/\|/g, "/")} |`,
      );
    lines.push("");
  }
  lines.push("## Open and buildable now", "");
  if (!buildable.length) lines.push("None.", "");
  else {
    lines.push("| Row | Plan item | What is missing |", "| --- | --- | --- |");
    for (const c of buildable)
      lines.push(
        `| ${c.id} | ${c.tasks.join(", ")} | ${c.gap.replace(/\|/g, "/")} |`,
      );
    lines.push("");
  }
  return lines.join("\n");
}

export function loadInputs() {
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Ledger;
  const rows = parseAcceptanceRows(readFileSync(ACCEPTANCE_PATH, "utf8"));
  const planOwners = parsePlanOwners(readFileSync(PLAN_PATH, "utf8"));
  return { ledger, rows, planOwners };
}

if (import.meta.main) {
  const { ledger, rows, planOwners } = loadInputs();
  if (process.argv.includes("--check")) {
    const problems = checkLedger(ledger, rows, planOwners);
    if (readFileSync(REPORT_PATH, "utf8") !== renderReport(ledger))
      problems.push(
        `${REPORT_PATH} is out of date (run bun scripts/coverage-ledger.ts)`,
      );
    for (const problem of problems) console.error(problem);
    console.log(`coverage-ledger: ${problems.length} problem(s)`);
    process.exit(problems.length ? 1 : 0);
  }
  const head = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const shas = blameLines(head);
  syncLedger(ledger, rows, planOwners, (line) => shas.get(line) ?? head);
  const options = (await resolveConfig(LEDGER_PATH)) ?? {};
  writeFileSync(
    LEDGER_PATH,
    await format(JSON.stringify(ledger), { ...options, parser: "json" }),
  );
  writeFileSync(REPORT_PATH, renderReport(ledger));
  const problems = checkLedger(ledger, rows, planOwners);
  for (const problem of problems) console.error(problem);
  console.log(
    `coverage-ledger: wrote ${LEDGER_PATH} and ${REPORT_PATH}; ${problems.length} problem(s)`,
  );
}
