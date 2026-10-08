/**
 * Runtime proof (PL-AUTH, AC-151 / PR12-10; AC-212; AC-403), outside writes
 * shard 6 of WRITE_SHARDS: see tenant-access-matrix.helpers.ts.
 */
import { describe, expect, it } from "vitest";
import {
  checkWrites,
  useMatrixClock,
  writeShardCallers,
} from "./tenant-access-matrix.helpers";

useMatrixClock();

describe("PL-AUTH workspace and role matrix (AC-151 / PR12-10): writes 6", () => {
  it(
    "no role of another workspace, no signed-out caller and no removed person changes workspace A records",
    async () => {
      const callers = writeShardCallers(6);
      expect(callers.length).toBeGreaterThan(0);
      const result = await checkWrites(callers, "writes 6");
      expect(result.failed).toEqual([]);
      expect(result.unreadable).toEqual([]);
      expect(result.writeProbes).toBeGreaterThan(0);
      expect(result.writeLeaks).toEqual([]);
    },
    30 * 60 * 1000,
  );
});
