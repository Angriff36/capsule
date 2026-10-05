/**
 * Runtime proof (PL-SCALE, AC-172): the notification bell
 * (convex/notifications.ts listNotifications) reads only the events waiting
 * for approval and those whose stage changed in the last seven days, yet
 * still names the events behind an open allergen incident and a double
 * booking. Another company's events never show.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-notification-events";
const OTHER = "tenant-notification-events-other";
const DAY = 86_400_000;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Note = { id: string; kind: string; message: string };

describe("runtime proof: the bell reads recent stage changes only (AC-172)", () => {
  it("shows approvals and recent stage changes, names incident and clash events", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "bell-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const now = Date.now();

    await owner.run(async (ctx) => {
      const event = async (
        tenantId: string,
        title: string,
        stage: string,
        stamps: Record<string, number> = {},
      ) =>
        (await ctx.db.insert("events", {
          tenantId,
          title,
          eventType: "dinner",
          stage: stage as never,
          version: 1,
          ...stamps,
        })) as Id<"events">;
      await event(TENANT, "Waiting gala", "pending_approval");
      await event(TENANT, "Fresh wedding", "approved", {
        approvedAt: now - 2 * DAY,
      });
      await event(TENANT, "Old wedding", "approved", {
        approvedAt: now - 10 * DAY,
      });
      await event(TENANT, "Dropped lunch", "cancelled", {
        cancelledAt: now - DAY,
      });
      await event(TENANT, "Done brunch", "closed_out", {
        completedAt: now - 3 * DAY,
        closedOutAt: now - DAY,
      });
      await event(OTHER, "Their gala", "pending_approval");
      await event(OTHER, "Their wedding", "approved", {
        approvedAt: now - DAY,
      });
      const quiet = await event(TENANT, "Quiet picnic", "planning");
      const crew = await event(TENANT, "Crew party", "planning");

      await ctx.db.insert("incidents", {
        tenantId: TENANT,
        eventId: quiet,
        severity: "high",
        category: "allergen",
        description: "Nut garnish on a nut-free plate",
        status: "open",
        reportedAt: now - DAY,
        version: 1,
      });
      const person = await ctx.db.insert("people", {
        tenantId: TENANT,
        givenName: "Sam",
        familyName: "Cook",
        email: "sam@example.com",
        role: "staff",
        employmentType: "full_time",
        status: "active",
        version: 1,
      });
      for (const eventId of [crew, quiet])
        await ctx.db.insert("shifts", {
          tenantId: TENANT,
          personId: person,
          eventId,
          startsAt: now + DAY,
          endsAt: now + DAY + 4 * 3_600_000,
          status: "scheduled",
          version: 1,
        });
    });

    const notes = (await owner.query(
      api.notifications.listNotifications,
      {},
    )) as Note[];
    const text = notes.map((n) => n.message).join("\n");

    expect(text).toContain('"Waiting gala" is awaiting approval');
    expect(text).toContain('"Fresh wedding" is now approved');
    expect(text).toContain('"Dropped lunch" is now cancelled');
    expect(text).toContain('"Done brunch" is now closed out');
    expect(text).not.toContain("Old wedding");
    expect(text).not.toContain("Their");
    expect(text).toContain(
      'Allergen incident reported for "Quiet picnic" — corrective action required',
    );
    const clash = notes.find((n) => n.kind === "shift_conflict");
    expect(clash?.message).toContain("Crew party");
    expect(clash?.message).toContain("Quiet picnic");
  });
});
