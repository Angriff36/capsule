import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  inspectEventManifestIntegration,
  inspectEventSource,
} from "../scripts/check-event-manifest-integration";

const read = (relativePath: string) => readFileSync(relativePath, "utf8");

describe("Event Manifest integration guard", () => {
  it("keeps the current authored Event integration on approved generated surfaces", () => {
    expect(inspectEventManifestIntegration()).toEqual([]);
  });

  it("routes Event feature writes through generated hooks or the creation adapter", () => {
    const detail = read("src/features/events/EventDetailPage.tsx");
    const guests = read("src/features/events/EventGuestPanel.tsx");
    const create = read("src/features/events/EventCreatePage.tsx");

    expect(detail).toContain('from "../../lib/manifest-convex-react"');
    expect(detail).toContain("useEventSubmitForApproval");
    expect(detail).toContain("useEventChangeHeadcount");
    expect(guests).toContain('from "../../lib/manifest-convex-react"');
    expect(guests).toContain("useEventGuestRsvpConfirm");
    expect(create).toContain('from "./eventPlanningApi"');
    expect(create).toContain("useCreateEvent");
  });

  it("requires lifecycle availability to consume generated transition metadata", () => {
    const lifecyclePolicy = read("src/features/events/EventLifecyclePolicy.ts");
    const guestPolicy = read("src/features/events/EventGuestPolicy.ts");

    expect(lifecyclePolicy).toContain(
      'from "../../generated/manifest-wiring-bindings"',
    );
    expect(lifecyclePolicy).toContain("EventSubmitForApprovalLifecycle");
    expect(lifecyclePolicy).toContain("EventApproveLifecycle");
    expect(guestPolicy).toContain("EventGuestRsvpConfirmLifecycle");
    expect(guestPolicy).toContain("EventGuestRsvpDeclineLifecycle");
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

  it("preserves allocation cleanup but rejects domain logic in the creation seam", () => {
    const seam = read("convex/lib/eventPlanning.ts");
    expect(inspectEventSource("convex/lib/eventPlanning.ts", seam)).toEqual([]);

    const violations = inspectEventSource(
      "convex/lib/eventPlanning.ts",
      `${seam}\nconst allowed = checkRole(user.role, "eventAccess");\n`,
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "allocation-seam-only" }),
      ]),
    );
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
