/**
 * Runtime proof (AC-639, BE-18.3): real command failures reach the screen as
 * one stable code each, read from the existing error text by the one shared
 * classifier (src/features/events/CommandFailure.ts) - no second envelope.
 * A record of another company and a record that does not exist give the same
 * code and the same words, and no failure text names a server file, a tenant
 * or a record id.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../../src/features/events/CommandFailure";

const M = api.mutations;
const START = Date.UTC(2026, 10, 7, 17, 0);
const END = Date.UTC(2026, 10, 7, 22, 0);

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}
type Proof = ReturnType<typeof harness>;
type Role = ReturnType<Proof["asRole"]>;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function role(proof: Proof, tenantId: string, name: string): Role {
  return proof.asRole({ subject: `${name}-${tenantId}`, role: name, tenantId });
}

async function newEvent(proof: Proof, sales: Role): Promise<string> {
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: "Failure code client",
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Failure code dinner",
      eventType: "corporate dinner",
      startsAt: START,
      endsAt: END,
      expectedHeadcount: 40,
      primaryContactName: "Casey Codes",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

async function failureOf(run: Promise<unknown>): Promise<CommandFailure> {
  try {
    await run;
  } catch (error) {
    return classifyCommandFailure(error);
  }
  throw new Error("The command was expected to fail.");
}

function expectNoInternals(failure: CommandFailure, ...secrets: string[]) {
  const text = `${failure.title} ${failure.detail}`;
  expect(text).not.toMatch(/convex\/|\.ts:\d|at handler|\[CONVEX/);
  for (const secret of secrets) expect(text).not.toContain(secret);
}

describe("runtime proof: command failures carry one stable code", () => {
  it("stale version, wrong stage, missing, other company and wrong role", async () => {
    const proof = harness();
    const tenantA = "tenant-ac639-a";
    const tenantB = "tenant-ac639-b";
    const salesA = role(proof, tenantA, "sales_manager");
    const salesB = role(proof, tenantB, "sales_manager");
    const kitchenA = role(proof, tenantA, "kitchen_staff");
    const eventId = await newEvent(proof, salesA);

    await proof.executeCommand(salesA, M.Event_changeHeadcount, {
      docId: eventId,
      version: 1,
      newHeadcount: 48,
    });
    const stale = await failureOf(
      proof.executeCommand(salesA, M.Event_changeHeadcount, {
        docId: eventId,
        version: 1,
        newHeadcount: 99,
      }),
    );
    expect(stale.code).toBe("STALE_VERSION");
    expect(stale.action?.reload).toBe(true);
    expectNoInternals(stale, tenantA, eventId);

    const wrongStage = await failureOf(
      proof.executeCommand(salesA, M.Event_complete, {
        docId: eventId,
        version: 2,
      }),
    );
    expect(wrongStage.code).toBe("INVALID_STATE");
    expectNoInternals(wrongStage, tenantA, eventId);

    const otherCompany = await failureOf(
      proof.executeCommand(salesB, M.Event_changeHeadcount, {
        docId: eventId,
        version: 2,
        newHeadcount: 12,
      }),
    );
    const otherEvent = await newEvent(proof, salesB);
    await salesB.run(async (ctx) =>
      (ctx.db as unknown as { delete(id: never): Promise<void> }).delete(
        otherEvent as never,
      ),
    );
    const missing = await failureOf(
      proof.executeCommand(salesB, M.Event_changeHeadcount, {
        docId: otherEvent,
        version: 1,
        newHeadcount: 12,
      }),
    );
    expect(otherCompany.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(missing.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(otherCompany.title).toBe(missing.title);
    expect(otherCompany.detail).toBe(missing.detail);
    expectNoInternals(otherCompany, tenantA, eventId);

    const wrongRole = await failureOf(
      proof.executeCommand(kitchenA, M.Event_changeHeadcount, {
        docId: eventId,
        version: 2,
        newHeadcount: 12,
      }),
    );
    expect(wrongRole.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expectNoInternals(wrongRole, tenantA, eventId);

    const event = (await salesA.run(async (ctx) =>
      ctx.db.get(eventId as never),
    )) as { expectedHeadcount: number; version: number };
    expect(event.expectedHeadcount).toBe(48);
    expect(event.version).toBe(2);
  });

  it("a refused value is VALIDATION_FAILED and keeps its plain words", async () => {
    const proof = harness();
    const owner = role(proof, "tenant-ac639-v", "owner");
    const failure = await failureOf(
      proof.executeCommand(owner, M.Announcement_createViaPost, {
        title: "   ",
        body: "Walk-in cooler is fixed.",
        category: "general",
        expiresAt: Date.UTC(2026, 11, 1),
      }),
    );
    expect(failure.detail).toBe("Give this announcement a title.");
    expect(failure.code).toBe("VALIDATION_FAILED");
  });
});
