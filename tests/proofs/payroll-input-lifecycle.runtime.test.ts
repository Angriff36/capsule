/**
 * Runtime proof: Person.hire → PayrollInput.prepare → finalize.
 * Seeds through public generated createVia / lifecycle mutations.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { PayrollInputPrepareParamsSchema } from "../../schemas/manifest-schemas";

const S = {
  tenantA: "tenant-payroll-a",
  tenantB: "tenant-payroll-b",
  periodStart: Date.UTC(2026, 6, 1, 0, 0),
  periodEnd: Date.UTC(2026, 6, 7, 23, 59),
} as const;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function hirePerson(proof: ReturnType<typeof harness>, tenantId: string) {
  const manager = proof.asRole({
    subject: `workforce-${tenantId}`,
    role: "workforce_manager",
    tenantId,
  });
  const person = (await proof.executeCommand(
    manager,
    api.mutations.Person_createViaHire,
    {
      givenName: "Pat",
      familyName: "Payroll",
      email: `pat-${tenantId}@proof.example`,
      role: "staff",
      employmentType: "full_time",
    },
  )) as { docId: string };
  return person.docId;
}

describe("runtime proof: PayrollInput prepare → finalize", () => {
  it("prepares and finalizes a payroll input with opaque person ids", async () => {
    const proof = harness();
    const personId = await hirePerson(proof, S.tenantA);
    const finance = proof.asRole({
      subject: "finance-manager-a",
      role: "finance_manager",
      tenantId: S.tenantA,
    });

    const prepareArgs = {
      personId,
      periodStart: S.periodStart,
      periodEnd: S.periodEnd,
      regularMinutes: 2400,
      overtimeMinutes: 120,
      totalMinutes: 2520,
    };
    expect(() =>
      PayrollInputPrepareParamsSchema.parse({
        ...prepareArgs,
        periodStart: new Date(S.periodStart),
        periodEnd: new Date(S.periodEnd),
      }),
    ).not.toThrow();

    const payroll = (await proof.executeCommand(
      finance,
      api.mutations.PayrollInput_createViaPrepare,
      prepareArgs,
    )) as { docId: string };

    const prepared = await finance.run(async (ctx) =>
      ctx.db.get(payroll.docId as never),
    );
    expect(prepared).toMatchObject({
      tenantId: S.tenantA,
      personId,
      status: "prepared",
      totalMinutes: 2520,
      preparedAt: expect.any(Number),
    });

    await proof.executeCommand(finance, api.mutations.PayrollInput_finalize, {
      docId: payroll.docId,
      version: 1,
    });
    const finalized = await finance.run(async (ctx) =>
      ctx.db.get(payroll.docId as never),
    );
    expect(finalized).toMatchObject({
      status: "finalized",
      finalizedAt: expect.any(Number),
      version: 2,
    });
  });

  it("denies kitchen staff and leaves no partial payroll input", async () => {
    const proof = harness();
    const personId = await hirePerson(proof, S.tenantA);
    const kitchen = proof.asRole({
      subject: "kitchen-staff-a",
      role: "kitchen_staff",
      tenantId: S.tenantA,
    });

    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.PayrollInput_createViaPrepare,
        {
          personId,
          periodStart: S.periodStart,
          periodEnd: S.periodEnd,
          regularMinutes: 60,
          overtimeMinutes: 0,
          totalMinutes: 60,
        },
      ),
    ).rejects.toThrow();

    const finance = proof.asRole({
      subject: "finance-reader-a",
      role: "finance_manager",
      tenantId: S.tenantA,
    });
    const listed = (await finance.query(
      api.queries.listPayrollInput,
      {},
    )) as Array<{ personId?: string }>;
    expect(listed.some((row) => row.personId === personId)).toBe(false);
  });

  it("keeps payroll inputs tenant-isolated", async () => {
    const proof = harness();
    const personA = await hirePerson(proof, S.tenantA);
    const financeA = proof.asRole({
      subject: "finance-manager-a2",
      role: "finance_manager",
      tenantId: S.tenantA,
    });
    await proof.executeCommand(
      financeA,
      api.mutations.PayrollInput_createViaPrepare,
      {
        personId: personA,
        periodStart: S.periodStart,
        periodEnd: S.periodEnd,
        regularMinutes: 480,
        overtimeMinutes: 0,
        totalMinutes: 480,
      },
    );

    const financeB = proof.asRole({
      subject: "finance-manager-b",
      role: "finance_manager",
      tenantId: S.tenantB,
    });
    const listedB = (await financeB.query(
      api.queries.listPayrollInput,
      {},
    )) as Array<{ personId?: string }>;
    expect(listedB.some((row) => row.personId === personA)).toBe(false);
  });
});
