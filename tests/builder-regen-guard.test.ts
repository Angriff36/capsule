import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BuilderRegenGuard } from "../scripts/builder-regen-guard";

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

describe("BuilderRegenGuard", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.length = 0;
  });

  function fixture(files: Record<string, string>): BuilderRegenGuard {
    const root = mkdtempSync(path.join(tmpdir(), "capsule-regen-guard-"));
    roots.push(root);
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
    }
    return new BuilderRegenGuard(root);
  }

  it("reports ownership sync when digests match", () => {
    const guard = fixture({
      ".builder/ownership.json": JSON.stringify({
        version: 1,
        files: { "convex/mutations.ts": { sha256: hash("ok") } },
      }),
      "convex/mutations.ts": "ok",
    });
    expect(guard.checkOwnershipSync()).toEqual([]);
  });

  it("reports drift when digests differ", () => {
    const guard = fixture({
      ".builder/ownership.json": JSON.stringify({
        version: 1,
        files: { "convex/mutations.ts": { sha256: hash("old") } },
      }),
      "convex/mutations.ts": "new",
    });
    expect(guard.checkOwnershipSync()[0]).toContain("convex/mutations.ts");
  });
});
