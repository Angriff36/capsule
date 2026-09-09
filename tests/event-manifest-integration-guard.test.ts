import { describe, expect, it } from "vitest";
import {
  inspectEventManifestIntegration,
  inspectEventSource,
} from "../scripts/check-event-manifest-integration";

describe("Event Manifest integration guard", () => {
  it("keeps the current authored Event integration on approved generated surfaces", () => {
    expect(inspectEventManifestIntegration()).toEqual([]);
  });

  it("rejects direct generated Convex imports from authored Event features", () => {
    const violations = inspectEventSource(
      "src/features/events/Bypass.tsx",
      'import { Event_approve } from "../../../convex/mutations";\n',
    );

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "approved-event-api-path" }),
      ]),
    );
  });

  it("rejects direct authored writes to Event-owned documents", () => {
    const insertViolations = inspectEventSource(
      "convex/lib/rogueEvent.ts",
      `
        import { mutation } from "../_generated/server";
        export const bypass = mutation({
          handler: async (ctx) => ctx.db.insert("events", { stage: "approved" }),
        });
      `,
    );
    const patchViolations = inspectEventSource(
      "convex/lib/rogueGuest.ts",
      `
        import { v } from "convex/values";
        const args = { guestId: v.id("eventGuests") };
        async function bypass(ctx: any, guestId: any) {
          await ctx.db.patch(guestId, { rsvpStatus: "confirmed" });
        }
      `,
    );

    for (const violations of [insertViolations, patchViolations]) {
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "generated-event-writes-only" }),
        ]),
      );
    }
  });

  it("rejects locally recreated Event lifecycle transition tables", () => {
    const violations = inspectEventSource(
      "src/features/events/LocalLifecycle.ts",
      `
        const transitions = [
          { property: "stage", from: "planning", to: "pending_approval" },
        ];
      `,
    );

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "generated-lifecycle-metadata" }),
      ]),
    );
  });
});
