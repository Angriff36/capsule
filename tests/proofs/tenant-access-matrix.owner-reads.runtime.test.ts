/**
 * Runtime proof (PL-AUTH, AC-151 / PR12-10; AC-212; AC-403), the read half
 * of tenant-access-matrix.ledger.json: see tenant-access-matrix.helpers.ts.
 */
import { describe, expect, it } from "vitest";
import {
  compareLedgerHalf,
  ownerReadLedger,
  useMatrixClock,
} from "./tenant-access-matrix.helpers";

useMatrixClock();

describe("PL-AUTH workspace and role matrix (AC-151 / PR12-10): owner reads", () => {
  it(
    "every read the ledger records as reaching workspace A still reaches it for A's owner",
    async () => {
      const result = await ownerReadLedger();
      expect(result.failed).toEqual([]);
      expect(compareLedgerHalf("reads", result.reads)).toEqual([]);
    },
    30 * 60 * 1000,
  );
});
