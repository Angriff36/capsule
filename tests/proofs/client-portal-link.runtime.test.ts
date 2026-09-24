/**
 * Client portal links stop working when staff turn them off, when they
 * expire, and when a newer link replaces them. An older signed link keeps
 * working only until a saved link exists for that event. Another company's
 * link does not open this event. The client's tax ID stays off the page.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createClientPortalToken } from "../../convex/lib/clientPortalToken";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantA: "tenant-portal-link-a",
  tenantB: "tenant-portal-link-b",
  startsAt: Date.UTC(2026, 9, 2, 16, 0),
  endsAt: Date.UTC(2026, 9, 2, 22, 0),
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

async function bookEvent(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  title: string,
) {
  const owner = proof.asRole({
    subject: `owner-${tenantId}`,
    role: "owner",
    tenantId,
  });
  const client = (await proof.executeCommand(
    owner,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: `${title} client` },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    owner,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "catering",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Pat Planner",
      budgetAmount: 2000,
      quotedPrice: 2400,
    },
  )) as { docId: string };
  return { owner, eventId: event.docId, clientId: client.docId };
}

describe("runtime proof: client portal links expire and turn off", () => {
  it("replaces, expires, and isolates client links", async () => {
    const proof = harness();
    const first = await bookEvent(proof, S.tenantA, "Porter dinner");
    const second = await bookEvent(proof, S.tenantB, "Other company lunch");

    const legacy = await createClientPortalToken({
      eventId: first.eventId,
      tenantId: S.tenantA,
    });
    await first.owner.run(async (ctx) => {
      await ctx.db.patch(first.clientId, { taxId: "12-3456789" });
    });
    const legacyView = (await first.owner.query(api.clientPortal.getEvent, {
      token: legacy,
    })) as { event?: { title?: string } } | null;
    expect(legacyView?.event?.title).toBe("Porter dinner");
    expect(JSON.stringify(legacyView)).not.toContain("12-3456789");

    const firstLink = (await proof.executeCommand(
      first.owner,
      api.lib.clientPortalLinks.issueClientPortalLink,
      { eventId: first.eventId },
    )) as string;
    const opened = (await first.owner.query(api.clientPortal.getEvent, {
      token: firstLink,
    })) as { event?: { title?: string } } | null;
    expect(opened?.event?.title).toBe("Porter dinner");
    expect(
      await first.owner.query(api.clientPortal.getEvent, { token: legacy }),
    ).toBeNull();

    const replacement = (await proof.executeCommand(
      first.owner,
      api.lib.clientPortalLinks.issueClientPortalLink,
      { eventId: first.eventId },
    )) as string;
    expect(replacement).not.toBe(firstLink);
    expect(
      await first.owner.query(api.clientPortal.getEvent, { token: firstLink }),
    ).toBeNull();
    expect(
      (
        (await first.owner.query(api.clientPortal.getEvent, {
          token: replacement,
        })) as { event?: { title?: string } } | null
      )?.event?.title,
    ).toBe("Porter dinner");

    await first.owner.run(async (ctx) => {
      await ctx.db.patch(replacement, { expiresAt: Date.now() - 60_000 });
    });
    expect(
      await first.owner.query(api.clientPortal.getEvent, {
        token: replacement,
      }),
    ).toBeNull();

    const renewed = (await proof.executeCommand(
      first.owner,
      api.lib.clientPortalLinks.issueClientPortalLink,
      { eventId: first.eventId },
    )) as string;
    await proof.executeCommand(
      first.owner,
      api.lib.clientPortalLinks.turnOffClientPortalLinks,
      { eventId: first.eventId },
    );
    expect(
      await first.owner.query(api.clientPortal.getEvent, { token: renewed }),
    ).toBeNull();
    expect(
      await first.owner.query(api.clientPortal.getEvent, { token: legacy }),
    ).toBeNull();

    const otherLink = (await proof.executeCommand(
      second.owner,
      api.lib.clientPortalLinks.issueClientPortalLink,
      { eventId: second.eventId },
    )) as string;
    const otherView = (await first.owner.query(api.clientPortal.getEvent, {
      token: otherLink,
    })) as { event?: { title?: string } } | null;
    expect(otherView?.event?.title).toBe("Other company lunch");
    expect(otherView?.event?.title).not.toBe("Porter dinner");
    expect(
      await first.owner.query(api.clientPortal.getEvent, {
        token: "not-a-client-link",
      }),
    ).toBeNull();
  });
});
