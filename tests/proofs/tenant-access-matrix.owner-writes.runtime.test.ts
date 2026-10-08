/**
 * Runtime proof (PL-AUTH, AC-151 / PR12-10; AC-212; AC-403), the write half
 * of tenant-access-matrix.ledger.json: see tenant-access-matrix.helpers.ts.
 */
import { describe, expect, it } from "vitest";
import {
  compareLedgerHalf,
  ownerWriteLedger,
  useMatrixClock,
} from "./tenant-access-matrix.helpers";

useMatrixClock();

describe("PL-AUTH workspace and role matrix (AC-151 / PR12-10): owner writes", () => {
  it(
    "every write the ledger records as changing workspace A still changes it for A's owner",
    async () => {
      const result = await ownerWriteLedger();
      expect(result.failed).toEqual([]);
      expect(compareLedgerHalf("writes", result.writes)).toEqual([]);
    },
    30 * 60 * 1000,
  );
});
