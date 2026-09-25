/**
 * Runtime proof: contact PII is masked on generated reads for roles that can
 * read the row but do not work with that person (2026-09-25).
 *
 *  - Event primary contact: raw for event/sales staff, masked for kitchen.
 *  - QuoteSubmission email/phone: raw for sales, masked for kitchen.
 *  - Person email/phone: raw for workforce staff and for the signed-in
 *    person's own row, masked on coworkers' rows for kitchen staff.
 * Stored values stay encrypted (Event/Person) and raw in mutations.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

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

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;
type Row = Record<string, unknown>;

const TENANT = "tenant-pii-masking";
const MASKED_EMAIL = /^\w\*\*\*@/;
const MASKED_PHONE = /^\*\*\*-\*\*\*-\d{4}$/;

async function run(
  proof: Proof,
  actor: Actor,
  fn: unknown,
  args: Record<string, unknown>,
): Promise<{ docId: string }> {
  return (await proof.executeCommand(actor, fn as never, args as never)) as {
    docId: string;
  };
}

async function list(actor: Actor, fn: unknown): Promise<Row[]> {
  return (await (
    actor as unknown as { query: (f: unknown, a: unknown) => Promise<unknown> }
  ).query(fn, {})) as Row[];
}

describe("runtime proof: PII masking on generated reads", () => {
  it("masks contact details for roles outside the owning domain", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-pii",
      role: "owner",
      tenantId: TENANT,
    });
    await run(proof, owner, api.mutations.Organization_createViaRegister, {
      name: "Masking kitchen",
    });

    // Staff roles resolve from their linked Person row.
    const hire = (
      subject: string,
      role: string,
      given: string,
      phone: string,
    ) =>
      run(proof, owner, api.mutations.Person_createViaHire, {
        givenName: given,
        familyName: "Crew",
        email: `${given.toLowerCase()}@example.com`,
        phone,
        role,
        employmentType: "full_time",
        authSubjectId: subject,
      });
    await hire("kitchen-pii", "kitchen_staff", "Kai", "555-010-1111");
    await hire("events-pii", "event_staff", "Eve", "555-010-2222");
    await hire("sales-pii", "sales_staff", "Sam", "555-010-3333");
    await hire("workforce-pii", "workforce_staff", "Wren", "555-010-4444");
    const kitchen = proof.asRole({
      subject: "kitchen-pii",
      role: "kitchen_staff",
      tenantId: TENANT,
    });
    const events = proof.asRole({
      subject: "events-pii",
      role: "event_staff",
      tenantId: TENANT,
    });
    const sales = proof.asRole({
      subject: "sales-pii",
      role: "sales_staff",
      tenantId: TENANT,
    });
    const workforce = proof.asRole({
      subject: "workforce-pii",
      role: "workforce_staff",
      tenantId: TENANT,
    });

    // Event primary contact.
    const client = await run(
      proof,
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Masked client",
      },
    );
    const event = await run(
      proof,
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Masked dinner",
        eventType: "catering",
        startsAt: Date.UTC(2026, 11, 19, 18, 0),
        endsAt: Date.UTC(2026, 11, 19, 22, 0),
        expectedHeadcount: 60,
        primaryContactName: "Morgan Host",
        primaryContactEmail: "morgan.host@example.com",
        primaryContactPhone: "555-777-9876",
        budgetAmount: 2000,
        quotedPrice: 3000,
      },
    );
    const eventFor = async (actor: Actor) =>
      (await list(actor, api.queries.listEvent)).find(
        (row) => row._id === event.docId,
      )!;
    const kitchenEvent = await eventFor(kitchen);
    expect(kitchenEvent.primaryContactEmail).toMatch(MASKED_EMAIL);
    expect(kitchenEvent.primaryContactPhone).toMatch(MASKED_PHONE);
    expect(kitchenEvent.primaryContactPhone).toBe("***-***-9876");
    expect(kitchenEvent.primaryContactName).toBe("Morgan Host");
    for (const allowed of [events, sales]) {
      const raw = await eventFor(allowed);
      expect(raw.primaryContactEmail).toBe("morgan.host@example.com");
      expect(raw.primaryContactPhone).toBe("555-777-9876");
    }

    // Public quote submission review queue.
    await (
      owner as unknown as {
        action: (f: unknown, a: unknown) => Promise<unknown>;
      }
    ).action(api.quoteBuilder.submitQuote, {
      clientName: "Quinn Prospect",
      email: "quinn@example.com",
      phone: "555-222-3456",
      eventDate: Date.UTC(2026, 11, 30, 17, 0),
      guestCount: 30,
      consent: true,
    });
    const [kitchenQuote] = await list(kitchen, api.queries.listQuoteSubmission);
    expect(kitchenQuote!.email).toMatch(MASKED_EMAIL);
    expect(kitchenQuote!.phone).toBe("***-***-3456");
    const [salesQuote] = await list(sales, api.queries.listQuoteSubmission);
    expect(salesQuote!.email).toBe("quinn@example.com");
    expect(salesQuote!.phone).toBe("555-222-3456");

    // Coworker contact details.
    const kitchenPeople = await list(kitchen, api.queries.listPerson);
    const self = kitchenPeople.find(
      (row) => row.authSubjectId === "kitchen-pii",
    )!;
    expect(self.email).toBe("kai@example.com");
    expect(self.phone).toBe("555-010-1111");
    const coworker = kitchenPeople.find(
      (row) => row.authSubjectId === "events-pii",
    )!;
    expect(coworker.email).toMatch(MASKED_EMAIL);
    expect(coworker.phone).toBe("***-***-2222");
    const workforcePeople = await list(workforce, api.queries.listPerson);
    const rawCoworker = workforcePeople.find(
      (row) => row.authSubjectId === "events-pii",
    )!;
    expect(rawCoworker.email).toBe("eve@example.com");
    expect(rawCoworker.phone).toBe("555-010-2222");

    // Storage keeps the encrypted value; masking is read-time only.
    const stored = (await owner.run(async (ctx) =>
      ctx.db.get(event.docId as never),
    )) as Row;
    expect(stored.primaryContactEmail).not.toBe("morgan.host@example.com");
    expect(stored.primaryContactEmail).not.toMatch(MASKED_EMAIL);
  });
});
