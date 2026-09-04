import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

type Finding = {
  file: string;
  family: string;
  cards: number;
  pills: number;
  heroScaffolds: number;
  narrowColumns: number;
  motion: number;
};

const ROOTS = ["src/app", "src/features", "src/ui"];
const SOURCE = /\.(?:tsx|css)$/;
const PAGE = /(?:Page\.tsx|\.css)$/;

const patterns = {
  cards: /(?:\bcard\b|-[Cc]ard(?:\b|s))/g,
  pills: /(?:rounded-(?:full|pill)|radius-pill|status-chip|meta-chip)/g,
  heroScaffolds: /(?:\beyebrow\b|display-title|hero-title|masthead)/g,
  narrowColumns:
    /(?:max-w-(?:xl|2xl|3xl|prose)|max-width:\s*(?:[3-7]\d{2}px|[3-4]\drem))/g,
  motion: /(?:\banimate-|@keyframes|animation:|translateY\()/g,
};

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : Promise.resolve([path]);
    }),
  );
  return files.flat();
}

function count(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

function familyFor(file: string) {
  const parts = file.replaceAll("\\", "/").split("/");
  if (parts[1] === "features") return parts[2] ?? "features";
  return parts[1] ?? "app";
}

export async function auditUiPatterns(root = process.cwd()) {
  const files = (
    await Promise.all(ROOTS.map((directory) => walk(resolve(root, directory))))
  )
    .flat()
    .filter((file) => SOURCE.test(file) && PAGE.test(file));

  const findings: Finding[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const finding: Finding = {
      file: relative(root, file).replaceAll("\\", "/"),
      family: familyFor(relative(root, file)),
      cards: count(source, patterns.cards),
      pills: count(source, patterns.pills),
      heroScaffolds: count(source, patterns.heroScaffolds),
      narrowColumns: count(source, patterns.narrowColumns),
      motion: count(source, patterns.motion),
    };
    if (
      finding.cards +
        finding.pills +
        finding.heroScaffolds +
        finding.narrowColumns +
        finding.motion >
      0
    ) {
      findings.push(finding);
    }
  }
  return findings.sort(
    (a, b) =>
      b.cards +
        b.pills +
        b.heroScaffolds +
        b.narrowColumns +
        b.motion -
        (a.cards + a.pills + a.heroScaffolds + a.narrowColumns + a.motion) ||
      a.file.localeCompare(b.file),
  );
}

function totals(findings: Finding[]) {
  return findings.reduce(
    (sum, item) => ({
      cards: sum.cards + item.cards,
      pills: sum.pills + item.pills,
      heroScaffolds: sum.heroScaffolds + item.heroScaffolds,
      narrowColumns: sum.narrowColumns + item.narrowColumns,
      motion: sum.motion + item.motion,
    }),
    { cards: 0, pills: 0, heroScaffolds: 0, narrowColumns: 0, motion: 0 },
  );
}

if (import.meta.main) {
  const findings = await auditUiPatterns();
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify({ totals: totals(findings), findings }, null, 2),
    );
  } else {
    console.log(
      "Unslop UI review queue (heuristic only; DESIGN.md remains authoritative)",
    );
    console.table(findings.slice(0, 30));
    console.log("Totals", totals(findings));
    console.log(
      `${findings.length} authored page/style files have review signals. This command never fails the build.`,
    );
  }
}
