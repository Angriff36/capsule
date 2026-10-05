/**
 * Runtime proof (AC-319, CF-8.4-02): at an event, the venue's vendor rules
 * apply. A banned vendor is refused for a rental or a purchase order for that
 * event; a restricted vendor goes through and the pickers flag it; preferred
 * and approved vendors pass. A rule not in force on the event's date, or
 * retired, does not count.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  DAY,
  harness,
  M,
  readDoc,
  run,
  seedVenueEvent,
} from "./venue-layout.runtime.helpers";

describe("runtime proof: venue vendor rules at the event", () => {
  it("blocks banned, flags restricted, passes preferred, ignores rules out of force", async () => {
    const proof = harness();
    const tenantId = "tenant-ac319-vendor-guard";
    const { roles, venueId, eventId } = await seedVenueEvent(proof, tenantId);
    const { startsAt } = await readDoc<{ startsAt: number }>(
      roles.events,
      eventId,
    );
    const vendor = async (name: string) =>
      (await run(proof, roles.owner, M.Vendor_createViaOnboard, { name }))
        .docId;
    const banned = await vendor("Smoky Grills");
    const restricted = await vendor("Loud Sound Co");
    const preferred = await vendor("Bloom Florists");
    const lapsed = await vendor("Old Tents");
    const retired = await vendor("Gone Linens");
    const rule = (vendorId: string, status: string, extra: object = {}) =>
      run(proof, roles.owner, M.VenueVendorRelationship_createViaEstablish, {
        venueId,
        vendorId,
        category: "other",
        status,
        ...extra,
      });
    await rule(banned, "banned");
    await rule(restricted, "restricted");
    await rule(preferred, "preferred");
    // Banned only until the week before the event: out of force on the day.
    await rule(lapsed, "banned", {
      effectiveFrom: startsAt - 60 * DAY,
      effectiveUntil: startsAt - 7 * DAY,
    });
    const gone = await rule(retired, "banned");
    await proof.executeCommand(roles.owner, M.VenueVendorRelationship_retire, {
      docId: gone.docId,
      reason: "Venue lifted the ban",
    });

    // The pickers' read.
    const rules = (await roles.logistics.query(api.venueVendorPolicy.forEvent, {
      eventId: eventId as never,
    })) as Array<{ vendorId: string; status: string }>;
    expect(
      Object.fromEntries(rules.map((r) => [r.vendorId, r.status])),
    ).toEqual({
      [banned]: "banned",
      [restricted]: "restricted",
      [preferred]: "preferred",
    });

    const rent = (vendorId: string) =>
      proof.executeCommand(
        roles.logistics,
        M.RentalOrderLine_createViaAskVendor,
        {
          eventId,
          vendorId,
          description: "Gear",
          quantity: 1,
        },
      );
    await expect(rent(banned)).rejects.toThrow(
      /Smoky Grills is not allowed at Garden Hall/,
    );
    await expect(rent(restricted)).resolves.toBeTruthy();
    await expect(rent(preferred)).resolves.toBeTruthy();
    await expect(rent(lapsed)).resolves.toBeTruthy();
    await expect(rent(retired)).resolves.toBeTruthy();

    // Purchase order opened for the event: the same rule.
    await expect(
      proof.executeCommand(roles.owner, M.VendorOrder_createViaOpen, {
        vendorId: banned,
        eventId,
      }),
    ).rejects.toThrow(/not allowed at Garden Hall/);
    await expect(
      proof.executeCommand(roles.owner, M.VendorOrder_createViaOpen, {
        vendorId: preferred,
        eventId,
      }),
    ).resolves.toBeTruthy();
    // An order for no event (weekly buying) is not a venue matter.
    await expect(
      proof.executeCommand(roles.owner, M.VendorOrder_createViaOpen, {
        vendorId: banned,
      }),
    ).resolves.toBeTruthy();

    // Nothing was saved for the refused rental.
    const lines = (await roles.logistics.query(
      api.queries.listRentalOrderLine,
      {},
    )) as Array<{
      vendorId: string;
    }>;
    expect(lines.map((line) => line.vendorId)).not.toContain(banned);

    // Another company's caller sees no rules for this event.
    const other = await seedVenueEvent(proof, "tenant-ac319-other");
    expect(
      await other.roles.logistics.query(api.venueVendorPolicy.forEvent, {
        eventId: eventId as never,
      }),
    ).toEqual([]);
  });
});
