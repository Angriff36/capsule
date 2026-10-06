/** bun scripts/analyze-tpp-packages.ts <TPP-export.json> [output-directory]
 * Read-only analysis. Outputs an HTML review and machine-readable proposals.
 */
import { resolve, join } from "node:path";
import { mkdir } from "node:fs/promises";
// This repository runs scripts with Bun but does not install its global types.
declare const Bun: {
  file(path: string): Blob;
  write(path: string, contents: string): Promise<number>;
};
import { indexTppFile } from "../src/lib/tppAccountFile";
import { inferTppFilePackages } from "../src/lib/tppPackageImport";

const input = process.argv[2];
if (!input) {
  console.error(
    "Usage: bun scripts/analyze-tpp-packages.ts <TPP-export.json> [output-directory]",
  );
  process.exit(1);
}
const output = resolve(process.argv[3] ?? ".artifacts/tpp-package-patterns");
const file = Bun.file(resolve(input));
console.log("Indexing export without loading embedded documents…");
const index = await indexTppFile(file);
const report = {
  sourceFingerprint: index.fingerprint,
  sourceStatus: index.metadata.manifest.status,
  ...(await inferTppFilePackages(file, index)),
};
await mkdir(output, { recursive: true });
await Bun.write(
  join(output, "proposals.json"),
  JSON.stringify(report, null, 2),
);
const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const quantity = (
  q: (typeof report.packages)[number]["candidates"][number]["quantityRule"],
) =>
  q
    ? `${q.quantity} ${q.scale === "fixed" ? "per event" : `per ${q.perUnits} ${q.scale}`}`
    : "Variable";
const sections = report.packages
  .map(
    (p) =>
      `<section><h2>${escape(p.name)}</h2><p>${p.occurrences} source occurrences · ${p.eligibleEvents} recent eligible events (${p.historicalEvents} in all history) · ${p.soloEvents} with no other package · ${escape(p.from)}–${escape(p.to)}</p><p>The three-occurrence rule selects <b>${p.naiveThreeOccurrenceMembers}</b> items. The stricter rule proposes <b>${p.proposedCoreMembers}</b> members with inferred quantity rules.</p><table><thead><tr><th>Equipment</th><th>With package</th><th>Without package</th><th>Only package</th><th>Proposed quantity</th><th>Assessment</th></tr></thead><tbody>${p.candidates
        .filter((c) => c.historicalSupport >= 3 || p.eligibleEvents < 3)
        .map(
          (c) =>
            `<tr class="${c.classification === "proposed_core" ? "core" : ""}"><td>${escape(c.name)}<br><small>Source ${escape(c.id)}</small></td><td>${c.support}/${c.events} (${pct(c.coverage)})</td><td>${c.backgroundCount}/${c.backgroundEvents} (${pct(c.backgroundRate)})</td><td>${c.soloSupport}/${c.soloEvents}</td><td>${escape(quantity(c.quantityRule))}<br><small>${pct(c.quantityAgreement)} agreement</small></td><td>${escape(c.classification.replaceAll("_", " "))}<details><summary>Evidence</summary><p>${escape(c.reasons.join(" ") || "Meets all proposal criteria; still inferred from event plans.")}</p><p>${Object.entries(
              c.byYear,
            )
              .map(([year, n]) => `${escape(year)}: ${n.present}/${n.events}`)
              .join(" · ")}</p></details></td></tr>`,
        )
        .join("")}</tbody></table></section>`,
  )
  .join("");
await Bun.write(
  join(output, "review.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TPP package pattern review</title><style>body{font:16px system-ui;margin:32px;color:#171717;max-width:1500px}h1{font-size:28px}section{margin:40px 0;overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd;vertical-align:top}th{background:#eee}.core{background:#eaf5ec}small{color:#555}summary{cursor:pointer}p{line-height:1.5}</style><h1>TPP package pattern review</h1><p>Proposals from recorded event plans. Green rows have consistent, distinctive membership and quantities. No live records have been changed. Source export status: <strong>${escape(report.sourceStatus)}</strong>.</p><p>Compare repetition with frequency, contemporaneous events without the package, and events without competing packages. Three occurrences alone cannot distinguish package contents from standard equipment. Membership and quantity changes remain visible.</p>${sections}</html>`,
);
for (const p of report.packages)
  console.log(
    JSON.stringify({
      name: p.name,
      occurrences: p.occurrences,
      events: p.eligibleEvents,
      solo: p.soloEvents,
      naive: p.naiveThreeOccurrenceMembers,
      core: p.proposedCoreMembers,
      coreItems: p.candidates
        .filter((c) => c.classification === "proposed_core")
        .map((c) => ({
          name: c.name,
          quantity: c.quantityRule,
          support: c.support,
          coverage: c.coverage,
        })),
    }),
  );
console.log(`Reports: ${output}`);
