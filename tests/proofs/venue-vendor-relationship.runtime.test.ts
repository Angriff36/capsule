/**
 * Runtime proof (AC-318, CF-8.4-01): a venue's vendor rule carries category,
 * one of four states, the vendor contact, dates in force, insurance and
 * compliance papers and notes. establish / reviseStatus / reviseDetails /
 * retire keep the dates in order, name who did it, and stay inside the
 * company.
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

type Rule = {
  _id: string;
  venueId: string;
  vendorId: string;
  category: string;
  status: string;
  effectiveFrom?: number;
  effectiveUntil?: number;
  primaryContactId?: string;
  insuranceCertificate?: string;
  insuranceExpiry?: number;
  complianceNotes?: string;
  notes?: string;
  establishedByPersonId?: string;
  revisedByPersonId?: string;
  deletedAt?: number | null;
};

describe("runtime proof: venue vendor rules", () => {
  it("carry every field, move between the four states, keep dates in order and stay in the company", async () => {
    const proof = harness();
    const tenantId = "tenant-ac318-venue-vendor";
    const { roles, venueId } = await seedVenueEvent(proof, tenantId);
    const vendor = await run(proof, roles.owner, M.Vendor_createViaOnboard, {
      name: "Bloom Florists",
    });
    const contact = await run(
      proof,
      roles.owner,
      M.VendorContact_createViaAdd,
      {
        vendorId: vendor.docId,
        name: "Sam Bloom",
      },
    );
    const from = Date.now();
    const rule = await run(
      proof,
      roles.owner,
      M.VenueVendorRelationship_createViaEstablish,
      {
        venueId,
        vendorId: vendor.docId,
        category: "florist",
        status: "preferred",
        effectiveFrom: from,
        effectiveUntil: from + 365 * DAY,
        primaryContactId: contact.docId,
        insuranceCertificate: "COI-2026-118",
        insuranceExpiry: from + 200 * DAY,
        complianceNotes: "Names the venue as additional insured",
        notes: "Uses the service elevator only",
      },
    );
    const read = () => readDoc<Rule>(roles.owner, rule.docId);
    const owner = await roles.owner.run(
      async (ctx) => (await ctx.db.query("people").collect())[0],
    );
    expect(await read()).toMatchObject({
      venueId,
      vendorId: vendor.docId,
      category: "florist",
      status: "preferred",
      effectiveFrom: from,
      effectiveUntil: from + 365 * DAY,
      primaryContactId: contact.docId,
      insuranceCertificate: "COI-2026-118",
      complianceNotes: "Names the venue as additional insured",
      notes: "Uses the service elevator only",
      establishedByPersonId: (owner as { _id: string })._id,
    });

    // Four states, each reachable from the others.
    for (const status of ["approved", "restricted", "banned", "preferred"]) {
      await proof.executeCommand(
        roles.owner,
        M.VenueVendorRelationship_reviseStatus,
        {
          docId: rule.docId,
          status,
        },
      );
      expect((await read()).status).toBe(status);
    }
    expect((await read()).revisedByPersonId).toBe(
      (owner as { _id: string })._id,
    );

    // Dates in force stay in order, on create and on change.
    await expect(
      proof.executeCommand(
        roles.owner,
        M.VenueVendorRelationship_createViaEstablish,
        {
          venueId,
          vendorId: vendor.docId,
          category: "linens",
          effectiveFrom: from + 10 * DAY,
          effectiveUntil: from,
        },
      ),
    ).rejects.toThrow(/Effective from must be before effective until/);
    await expect(
      proof.executeCommand(
        roles.owner,
        M.VenueVendorRelationship_reviseDetails,
        {
          docId: rule.docId,
          effectiveUntil: from - DAY,
        },
      ),
    ).rejects.toThrow(/Effective from must be before effective until/);
    await proof.executeCommand(
      roles.owner,
      M.VenueVendorRelationship_reviseDetails,
      {
        docId: rule.docId,
        insuranceCertificate: "COI-2027-004",
      },
    );
    expect((await read()).insuranceCertificate).toBe("COI-2027-004");

    // Another company cannot see or change it.
    const other = await seedVenueEvent(proof, "tenant-ac318-other");
    const theirs = (await other.roles.owner.query(
      api.queries.listVenueVendorRelationship,
      {},
    )) as Rule[];
    expect(theirs.map((row) => row._id)).not.toContain(rule.docId);
    await expect(
      proof.executeCommand(
        other.roles.owner,
        M.VenueVendorRelationship_reviseStatus,
        {
          docId: rule.docId,
          status: "banned",
        },
      ),
    ).rejects.toThrow();
    expect((await read()).status).toBe("preferred");

    // Retire needs a reason and takes it off the list.
    await expect(
      proof.executeCommand(roles.owner, M.VenueVendorRelationship_retire, {
        docId: rule.docId,
        reason: " ",
      }),
    ).rejects.toThrow(/Say why/);
    await proof.executeCommand(roles.owner, M.VenueVendorRelationship_retire, {
      docId: rule.docId,
      reason: "Florist closed",
    });
    expect((await read()).deletedAt).not.toBeNull();
  });
});
