/**
 * Runtime proof (TPP Contact Letter Builder parity, work/reports/letter-drafter.png):
 * the letter carries the company heading, a chosen or no letter date, the
 * contact's address, Ref / Attn / Subject, greeting, body, closing, sender
 * lines and CC, and leaves out every line the writer left empty.
 * Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import type { TppReportResult } from "../../src/features/reports/tpp/types";

const tenantId = "tenant-contact-letter";
const day = Date.UTC(2026, 8, 4, 12);

describe("runtime proof: Contact Letter Builder writes a full letter", () => {
  it("shows the filled lines and drops the empty ones", async () => {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "letter-owner",
      role: "owner",
      tenantId,
    });
    const clientId = await owner.run(async (ctx) => {
      const base = {
        tenantId,
        version: 1,
        createdAt: day,
        updatedAt: day,
        deletedAt: null,
      };
      await ctx.db.insert(
        "organizations" as never,
        {
          ...base,
          name: "Mangia Catering LLC",
          brandDisplayName: "Mangia Catering",
          brandAddress: "22425 East Appleway Ave, Liberty Lake, WA 99019",
          status: "active",
        } as never,
      );
      return String(
        await ctx.db.insert(
          "clients" as never,
          {
            ...base,
            clientType: "person",
            givenName: "Samantha",
            familyName: "Reyes",
            addressLine1: "1102 N 16th Ave",
            city: "Yakima",
            region: "WA",
            postalCode: "98902",
            taxExempt: false,
            paymentTermsDays: 30,
            status: "active",
          } as never,
        ),
      );
    });

    const full = (await owner.query(api.tppReports.contacts.run, {
      reportId: "contact-letter-builder",
      parameters: {
        clientId,
        showCompanyInfo: true,
        letterDate: day,
        noLetterDate: false,
        ref: "Event 6014",
        attn: "Wedding planner",
        subject: "Your tasting",
        salutation: "Dear Samantha,",
        body: "Thank you for choosing us.",
        closing: "Sincerely,",
        senderName: "Joshua Mitchell",
        senderTitle: "Sales",
        senderCompany: "Mangia Catering",
        cc: "Venue office",
      },
    })) as TppReportResult;
    expect(full.kind).toBe("document");
    const text = JSON.stringify(full);
    for (const part of [
      "Mangia Catering",
      "22425 East Appleway Ave",
      "September 4, 2026",
      "Samantha Reyes",
      "Yakima WA 98902",
      "Event 6014",
      "Wedding planner",
      "Your tasting",
      "Dear Samantha,",
      "Thank you for choosing us.",
      "Sincerely,",
      "Joshua Mitchell",
      "Venue office",
    ]) {
      expect(text).toContain(part);
    }

    const bare = (await owner.query(api.tppReports.contacts.run, {
      reportId: "contact-letter-builder",
      parameters: {
        clientId,
        showCompanyInfo: false,
        letterDate: day,
        noLetterDate: true,
        body: "Just the letter.",
      },
    })) as TppReportResult;
    if (bare.kind !== "document") throw new Error("expected a document");
    const ids = bare.sections.map((section) => section.id);
    expect(ids).toEqual(["recipient", "body"]);
    const bareText = JSON.stringify(bare);
    expect(bareText).not.toContain("22425 East Appleway Ave");
    expect(bareText).not.toContain("2026");
    expect(bareText).not.toContain('"—"');
  });

  it("prints the contract like the old system: event facts, timeline in kitchen time, terms, initials", async () => {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "contract-owner",
      role: "owner",
      tenantId,
    });
    // 3:00 PM on Sept 5 2026 in Spokane (UTC-7) = 22:00 UTC.
    const ceremony = Date.UTC(2026, 8, 5, 22);
    const eventId = await owner.run(async (ctx) => {
      const base = {
        tenantId,
        version: 1,
        createdAt: day,
        updatedAt: day,
        deletedAt: null,
      };
      const insert = (table: string, doc: Record<string, unknown>) =>
        ctx.db.insert(table as never, { ...base, ...doc } as never);
      await insert("organizations", {
        name: "Mangia Catering LLC",
        brandDisplayName: "Mangia Catering",
        status: "active",
      });
      const locationId = await insert("operatingLocations", {
        name: "Liberty Lake kitchen",
        timeZone: "America/Los_Angeles",
        status: "active",
      });
      const clientId = await insert("clients", {
        clientType: "person",
        givenName: "Ashley",
        familyName: "Borello",
        addressLine1: "1102 N 16th Ave",
        city: "Yakima",
        region: "WA",
        postalCode: "98902",
        email: "ash@example.com",
        taxExempt: false,
        paymentTermsDays: 30,
        status: "active",
      });
      const eventId = await insert("events", {
        title: "Ashley's Wedding",
        eventType: "wedding",
        eventNumber: "6014",
        stage: "planning",
        startsAt: ceremony,
        clientId,
        operatingLocationId: locationId,
        expectedHeadcount: 167,
        serviceStyleName: "Buffet - Cook Onsite",
        occasionName: "Wedding",
        ownerName: "Joshua Mitchell",
        venueName: "Private Residence",
      });
      await insert("eventTimelineActivities", {
        eventId,
        name: "Ceremony Start",
        startsAt: ceremony,
      });
      await insert("eventTimelineActivities", {
        eventId,
        name: "Removed step",
        startsAt: ceremony,
        deletedAt: day,
      });
      await insert("proposals", {
        clientId,
        eventId,
        title: "Ashley proposal",
        proposalNumber: "P-6014",
        status: "sent",
        eventDate: ceremony,
        guestCount: 167,
        terms: "Standard Service time is 1.5 hours from meal service.",
        subtotal: 38238.15,
        taxAmount: 0,
        discountAmount: 0,
        total: 38238.15,
      });
      return String(eventId);
    });

    const result = (await owner.query(api.tppReports.contacts.run, {
      reportId: "contract-for-service",
      parameters: { eventId },
    })) as TppReportResult;
    if (result.kind !== "document") throw new Error("expected a document");
    const text = JSON.stringify(result);
    for (const part of [
      "Mangia Catering",
      "Ashley Borello",
      "1102 N 16th Ave",
      "ash@example.com",
      "6014",
      "Saturday",
      "167",
      "Buffet - Cook Onsite",
      "Joshua Mitchell",
      "$38,238.15",
      "Private Residence",
      "3:00 PM",
      "Ceremony Start",
      "I have reviewed my menu",
      "Standard Service time is 1.5 hours",
      "Client initial",
      "No contract has been created for this event.",
    ]) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain("Removed step");
  });
});
