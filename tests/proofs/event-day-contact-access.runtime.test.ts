/**
 * Runtime proof: Event Day client/venue numbers follow the Event contact
 * policy (2026-09-25 review). Event/sales staff and crew working the event
 * (assigned, or driving one of its deliveries) get the numbers; other staff
 * get names with the numbers withheld (contactAccess "withheld"), so the
 * day-of sheet can say where the numbers are instead of "No day-of phone".
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  EVENT_CONTACT_ROLES,
  mayCallContacts,
} from "../../convex/eventDayBriefing";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { compileProjectToIR } from "@angriff36/manifest/multi-compiler";
import { readFile, access } from "node:fs/promises";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(ensureTestFieldEncryptionKey);

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;
const TENANT = "tenant-event-day-contacts";

function run(proof: Proof, actor: Actor, fn: unknown, args: object) {
  return proof.executeCommand(actor, fn as never, args as never) as Promise<{
    docId: string;
  }>;
}

async function briefing(actor: Actor, eventId: string) {
  return (await (
    actor as unknown as { query: (f: unknown, a: unknown) => Promise<unknown> }
  ).query(api.eventDayBriefing.getBriefing, { eventId })) as {
    contactAccess: string;
    event: { primaryContactName: string; primaryContactPhone: string | null };
  };
}

describe("runtime proof: Event Day contact access", () => {
  it("gives numbers to event staff and the event's crew, withholds them from other staff", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-evd",
      role: "owner",
      tenantId: TENANT,
    });
    await run(proof, owner, api.mutations.Organization_createViaRegister, {
      name: "EVD kitchen",
    });
    const hire = (subject: string, role: string, given: string) =>
      run(proof, owner, api.mutations.Person_createViaHire, {
        givenName: given,
        familyName: "Crew",
        email: `${given.toLowerCase()}@example.com`,
        role,
        employmentType: "full_time",
        authSubjectId: subject,
      });
    await hire("evd-events", "event_staff", "Eve");
    const onShift = await hire("evd-cook-on", "kitchen_staff", "Kim");
    await hire("evd-cook-off", "kitchen_staff", "Kip");
    const client = await run(
      proof,
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "EVD client",
      },
    );
    const event = await run(
      proof,
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "EVD dinner",
        eventType: "catering",
        startsAt: Date.UTC(2026, 11, 20, 18, 0),
        endsAt: Date.UTC(2026, 11, 20, 22, 0),
        expectedHeadcount: 30,
        primaryContactName: "Hosting Hal",
        primaryContactPhone: "555-303-4040",
        budgetAmount: 1000,
        quotedPrice: 1500,
      },
    );
    await run(proof, owner, api.mutations.EventAssignment_createViaAssign, {
      eventId: event.docId,
      personId: onShift.docId,
      role: "cook",
    });

    const as = (subject: string, role: string) =>
      proof.asRole({ subject, role, tenantId: TENANT });
    for (const actor of [
      as("evd-events", "event_staff"),
      as("evd-cook-on", "kitchen_staff"),
    ]) {
      const seen = await briefing(actor, event.docId);
      expect(seen.contactAccess).toBe("full");
      expect(seen.event.primaryContactPhone).toBe("555-303-4040");
    }
    const unassigned = await briefing(
      as("evd-cook-off", "kitchen_staff"),
      event.docId,
    );
    expect(unassigned.contactAccess).toBe("withheld");
    expect(unassigned.event.primaryContactPhone).toBeNull();
    expect(unassigned.event.primaryContactName).toBe("Hosting Hal");
  });

  it("covers drivers, dropped assignments and the org event/sales switches", () => {
    const kitchen = {
      role: "kitchen_staff",
      personId: "p1",
      disabledCapabilities: [],
    };
    expect(mayCallContacts(kitchen, [], [{ driverId: "p1" }])).toBe(true);
    expect(
      mayCallContacts(kitchen, [{ personId: "p1", status: "unassigned" }], []),
    ).toBe(false);
    expect(
      mayCallContacts(kitchen, [{ personId: "p1", status: "no_show" }], []),
    ).toBe(false);
    expect(
      mayCallContacts(kitchen, [{ personId: "p2", status: "assigned" }], []),
    ).toBe(false);
    const events = {
      role: "event_staff",
      personId: null,
      disabledCapabilities: [],
    };
    expect(mayCallContacts(events, [], [])).toBe(true);
    expect(
      mayCallContacts(
        { ...events, disabledCapabilities: ["events", "sales"] },
        [],
        [],
      ),
    ).toBe(false);
  });

  it("keeps the contact role set equal to the compiled eventAccess/salesAccess roles", async () => {
    const root = path.resolve(__dirname, "../..");
    const { ir } = await compileProjectToIR({
      entries: [path.join(root, "src/app.manifest")],
      host: {
        readFile: (p: string) => readFile(p, "utf8"),
        resolvePath: (from: string, rel: string) => path.resolve(from, rel),
        fileExists: (p: string) =>
          access(p).then(
            () => true,
            () => false,
          ),
      },
      basePath: root,
    });
    const expected = (ir!.roles ?? [])
      .filter((role) =>
        (role.effectivePermissions ?? []).some(
          (p) => p.action === "eventAccess" || p.action === "salesAccess",
        ),
      )
      .map((role) => role.name)
      .sort();
    expect([...EVENT_CONTACT_ROLES].sort()).toEqual(expected);
  });
});
