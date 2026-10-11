/**
 * A wrong tap at the door can be taken back: undoing a check-in clears the
 * arrival time and keeps the guest's RSVP.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("guest check-in undo", () => {
  it("clears the arrival and keeps the RSVP", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const tenantId = "tenant-guest-undo";
    const sales = proof.asRole({
      subject: "guest-undo-sales",
      role: "sales_manager",
      tenantId,
    });
    const events = proof.asRole({
      subject: "guest-undo-events",
      role: "event_manager",
      tenantId,
    });
    const client = (await proof.executeCommand(
      sales,
      M.Client_createViaRegister,
      { clientType: "company", companyName: "Guest undo client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      M.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Guest undo dinner",
        eventType: "corporate dinner",
        venueName: "Proof Hall",
        serviceStyleName: "Plated",
        startsAt: Date.UTC(2026, 11, 12, 2, 0),
        endsAt: Date.UTC(2026, 11, 12, 6, 0),
        expectedHeadcount: 20,
        primaryContactName: "Casey Undo",
        budgetAmount: 1000,
        quotedPrice: 1500,
      },
    )) as { docId: string };
    const guest = (await proof.executeCommand(
      events,
      M.EventGuest_createViaInvite,
      { eventId: event.docId, name: "Dev Patel" },
    )) as { docId: string };

    await proof.executeCommand(events, M.EventGuest_checkIn, {
      docId: guest.docId,
      version: 1,
    });
    await proof.executeCommand(events, M.EventGuest_undoCheckIn, {
      docId: guest.docId,
      version: 2,
    });

    const row = (await events.run(async (ctx) =>
      ctx.db.get(guest.docId as never),
    )) as { checkedInAt?: number | null; rsvpStatus: string };
    expect(row.checkedInAt ?? null).toBeNull();
    expect(row.rsvpStatus).toBe("confirmed");

    // Nothing to undo once it is undone.
    await expect(
      proof.executeCommand(events, M.EventGuest_undoCheckIn, {
        docId: guest.docId,
        version: 3,
      }),
    ).rejects.toThrow();
  });
});
