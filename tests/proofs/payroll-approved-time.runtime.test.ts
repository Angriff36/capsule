/**
 * PL-PAYROLL (AC-627, AC-510 receipt, AC-130): a payroll input made from
 * approved time names the entries it covers, so the same approved time
 * cannot be paid twice; a download leaves a receipt per person and period;
 * a provider rejection keeps the approved time untouched.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  harness,
  rolesFor,
  runner,
} from "./headcount-staffing-reconciliation.runtime.helpers";
import type { PersonPeriodLaborSummary } from "../../src/features/facilities/useLaborSummary";
import { payrollPeriodKey } from "../../src/features/finance/payrollReconcile";

const M = api.mutations;
const TENANT = "tenant-payroll-approved";
const H = 3_600_000;
const IN = Date.UTC(2026, 2, 3, 14);

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("approved time to one payroll input (AC-627)", () => {
  it("approved time produces one traceable payroll input", async () => {
    const proof = harness();
    const { workforce } = rolesFor(proof, TENANT);
    const manage = runner(proof, workforce);
    const pay = runner(
      proof,
      proof.asRole({
        subject: `finance-${TENANT}`,
        role: "finance_manager",
        tenantId: TENANT,
      }),
    );
    await manage(M.Person_createViaHire, {
      givenName: "Mona",
      familyName: "Manager",
      email: "mona@payroll.example",
      role: "workforce_manager",
      employmentType: "full_time",
      authSubjectId: `workforce-${TENANT}`,
    });
    const ada = await manage(M.Person_createViaHire, {
      givenName: "Ada",
      familyName: "Cook",
      email: "ada@payroll.example",
      role: "event_staff",
      employmentType: "part_time",
    });
    const read = async <T>(id: string) =>
      (await workforce.run(async (ctx) => ctx.db.get(id as never))) as T;

    // Two approved shifts: 5 h with a 30 min unpaid lunch, and 3 h.
    const entries: string[] = [];
    for (const [start, hours, lunch] of [
      [IN, 5, 30],
      [IN + 24 * H, 3, 0],
    ] as const) {
      const made = await manage(M.TimeRecord_createViaClockIn, {
        personId: ada.docId,
      });
      let row = await read<Doc<"timeRecords">>(made.docId);
      await manage(M.TimeRecord_clockOut, {
        docId: made.docId,
        version: row.version,
        breakMinutes: lunch,
      });
      row = await read<Doc<"timeRecords">>(made.docId);
      await manage(M.TimeRecord_correct, {
        docId: made.docId,
        version: row.version,
        clockInAt: start,
        clockOutAt: start + hours * H,
        reason: "Hours from the sign-in sheet",
      });
      row = await read<Doc<"timeRecords">>(made.docId);
      await manage(M.TimeRecord_approve, {
        docId: made.docId,
        version: row.version,
      });
      entries.push(made.docId);
    }

    const period = { periodStart: IN - 24 * H, periodEnd: IN + 6 * 24 * H };
    const summary = (await workforce.query(
      api.laborSummary.personPeriodLaborSummary,
      { personId: ada.docId as never, ...period },
    )) as PersonPeriodLaborSummary;
    expect(summary.approvedMinutes).toBe(450);
    expect([...summary.approvedTimeRecordIds].sort()).toEqual(
      [...entries].sort(),
    );

    const input = await pay(M.PayrollInput_createViaPrepare, {
      personId: ada.docId,
      ...period,
      regularMinutes: 450,
      overtimeMinutes: 0,
      totalMinutes: 450,
      sourceTimeRecordIds: summary.approvedTimeRecordIds,
    });
    const prepared = await read<Doc<"payrollInputs">>(input.docId);
    expect([...prepared.sourceTimeRecordIds].sort()).toEqual(
      [...entries].sort(),
    );

    // The same approved entries cannot go into a second input.
    await expect(
      pay(M.PayrollInput_createViaPrepare, {
        personId: ada.docId,
        ...period,
        regularMinutes: 180,
        overtimeMinutes: 0,
        totalMinutes: 180,
        sourceTimeRecordIds: [entries[1]!],
      }),
    ).rejects.toThrow(/already in another payroll input/);
    expect(
      (
        (await workforce.run(async (ctx) =>
          ctx.db.query("payrollInputs").collect(),
        )) as Doc<"payrollInputs">[]
      ).filter((row) => row.deletedAt == null),
    ).toHaveLength(1);

    // Voiding the first frees the entries for a fresh input.
    await pay(M.PayrollInput_markVoided, {
      docId: input.docId,
      version: prepared.version,
      reason: "Wrong period",
    });
    await pay(M.PayrollInput_createViaPrepare, {
      personId: ada.docId,
      ...period,
      regularMinutes: 180,
      overtimeMinutes: 0,
      totalMinutes: 180,
      sourceTimeRecordIds: [entries[1]!],
    });

    // Download receipt, then the provider turns it down: time untouched.
    const key = payrollPeriodKey(ada.docId, "2026-03-02", "2026-03-08");
    const receipt = await pay(M.PayrollExportRecord_createViaRecord, {
      personId: ada.docId,
      periodKey: key,
      periodStart: "2026-03-02",
      periodEnd: "2026-03-08",
      processor: "gusto",
      revision: 1,
      regularMinutes: 450,
      overtimeMinutes: 0,
      totalMinutes: 450,
      deltaMinutes: 450,
      idempotencyKey: `${key}#1`,
    });
    const again = await pay(M.PayrollExportRecord_createViaRecord, {
      personId: ada.docId,
      periodKey: key,
      periodStart: "2026-03-02",
      periodEnd: "2026-03-08",
      processor: "gusto",
      revision: 1,
      regularMinutes: 450,
      overtimeMinutes: 0,
      totalMinutes: 450,
      deltaMinutes: 450,
      idempotencyKey: `${key}#1`,
    });
    expect(again.docId).toBe(receipt.docId);
    const saved = await read<Doc<"payrollExportRecords">>(receipt.docId);
    expect(saved).toMatchObject({ status: "exported", revision: 1 });
    expect(saved.exportedAt).not.toBeNull();
    await pay(M.PayrollExportRecord_reject, {
      docId: receipt.docId,
      version: saved.version,
      reason: "Unknown employee number",
    });
    expect(
      (await read<Doc<"payrollExportRecords">>(receipt.docId)).status,
    ).toBe("rejected");
    for (const id of entries)
      expect((await read<Doc<"timeRecords">>(id)).approvedAt).not.toBeNull();
  });
});
