/**
 * Proof: the Vercel command API function (api/manifest.ts) loads. Vercel runs
 * it as plain Node ESM, which refuses a relative import without its file
 * ending; one such import made every /api/manifest call answer 500 in
 * production (release ccef7641, 2026-10-04). Every relative import reachable
 * from the function must end in ".js".
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

function reachableImports(entry: string): { file: string; spec: string }[] {
  const found: { file: string; spec: string }[] = [];
  const seen = new Set<string>();
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(RELATIVE_IMPORT)) {
      const spec = match[1] as string;
      found.push({ file, spec });
      const base = resolve(dirname(file), spec.replace(/\.js$/, ""));
      const next = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(
        existsSync,
      );
      if (next) queue.push(next);
    }
  }
  return found;
}

describe("Vercel command API function imports", () => {
  it("every relative import reachable from api/manifest.ts ends in .js", () => {
    const imports = reachableImports("api/manifest.ts");
    expect(imports.length).toBeGreaterThan(0);
    const missing = imports
      .filter(({ spec }) => !spec.endsWith(".js"))
      .map(({ file, spec }) => `${file}: ${spec}`);
    expect(missing).toEqual([]);
  });
});
