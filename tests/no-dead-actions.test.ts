/**
 * AC-194 / AC-638 (CF-1-fw9, BE-18.2): no shipped screen has a button or
 * form whose action is empty, only logs, or claims "coming soon". Screens
 * calling functions that do not exist are caught by backend-ui-contract.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}

const DEAD = [
  /on(Click|Submit)=\{\(\)\s*=>\s*\{\s*\}\}/,
  /on(Click|Submit)=\{\(\)\s*=>\s*(undefined|null)\}/,
  /on(Click|Submit)=\{\(\)\s*=>\s*console\.\w+\(/,
  /\b(coming soon|not implemented yet|mock success|TODO: wire)\b/i,
  // AC-641: reads are live; a full reload after an action hides a stale page
  // and throws away what the person typed. Retry buttons on errors are fine.
  /^\s*window\.location\.reload\(\);/,
];

describe("no dead actions on shipped screens", () => {
  it("no empty, log-only or coming-soon handlers in src/features", () => {
    const hits = walk("src/features")
      .filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f))
      .flatMap((file) =>
        readFileSync(join(ROOT, file), "utf8")
          .split("\n")
          .flatMap((line, i) =>
            DEAD.some((p) => p.test(line)) ? [`${file}:${i + 1}`] : [],
          ),
      );
    expect(hits).toEqual([]);
  });
});
