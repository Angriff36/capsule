/**
 * Runtime proof (PL-AUTH, AC-151 / PR12-10; AC-212; AC-403), outside reads
 * for every caller: see tenant-access-matrix.helpers.ts.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkReads,
  OUTSIDERS,
  useMatrixClock,
  WRITE_SHARDS,
} from "./tenant-access-matrix.helpers";

useMatrixClock();

describe("PL-AUTH workspace and role matrix (AC-151 / PR12-10): reads", () => {
  it(
    "no role of another workspace, no signed-out caller and no removed person reads workspace A records",
    async () => {
      const result = await checkReads(OUTSIDERS, "reads");
      expect(result.failed).toEqual([]);
      expect(result.unreadable).toEqual([]);
      expect(result.readProbes).toBeGreaterThan(0);
      expect(result.readLeaks).toEqual([]);
    },
    30 * 60 * 1000,
  );

  it("every outside-writes shard file exists", () => {
    const missing: string[] = [];
    for (let shard = 1; shard <= WRITE_SHARDS; shard += 1) {
      const name = `tenant-access-matrix.writes-${shard}.runtime.test.ts`;
      if (!existsSync(fileURLToPath(new URL(`./${name}`, import.meta.url))))
        missing.push(name);
    }
    expect(missing).toEqual([]);
  });
});
