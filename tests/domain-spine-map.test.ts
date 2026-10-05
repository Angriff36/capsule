/**
 * AC-195..AC-198, AC-200..AC-202, AC-367, AC-402: every record kind the
 * feature spec names maps to a record Capsule already has (checked against
 * the compiled Manifest model), and no parallel CRM, event, pricing, menu or
 * reporting record sits beside them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface IrEntity {
  name: string;
  properties: { name: string; type: { name: string } }[];
}
const ir = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "generated/ir/merged.ir.json"),
    "utf8",
  ),
) as {
  entities: IrEntity[];
  enums: { name: string; values: { name: string }[] }[];
  commands: { entity: string; name: string }[];
};
const entity = (name: string) => ir.entities.find((e) => e.name === name);

/** Spec name -> "Entity", "Entity.property", "Entity.command()" or "Enum:value". */
const SPINE: Record<string, Record<string, string[]>> = {
  "AC-195 sales": {
    Contact: ["ClientContact"],
    "Company/Account": ["Client.clientType"],
    "Inquiry/Lead": ["Lead", "QuoteSubmission"],
    "Deal/Opportunity": ["Lead.stage", "Lead.estimatedValue", "Proposal"],
    Event: ["Event"],
  },
  "AC-196 reference data": {
    "Event Status": ["Event.stage"],
    "Service Style": ["ServiceStyle"],
    Occasion: ["Occasion"],
    Venue: ["Venue"],
    "Salesperson/Owner": [
      "Event.assignOwner()",
      "Client.assignOwner()",
      "Person",
    ],
    "Referral Source": ["ReferralSource"],
  },
  "AC-197 proposal": {
    Proposal: ["Proposal"],
    "Proposal Revision": ["ProposalRevision"],
    "Proposal Section": [
      "ProposalSection:menu_sections",
      "Proposal.sectionOrder",
    ],
    "Proposal Line Item": ["ProposalLineItem", "ProposalDishSelection"],
    "Proposal Timeline Item": [
      "ProposalSection:timeline",
      "EventTimelineActivity",
    ],
    "Proposal Enhancement": ["ProposalEnhancement"],
    "Share Link": ["ShareLink"],
    "Signature/Acceptance Request": ["SignatureRequest"],
  },
  "AC-198 operations": {
    "Staff Shift/Assignment": ["Shift", "EventAssignment"],
    "PrepList/PrepTask": ["PrepTask"],
    "Equipment PackList/PackListItem": ["PackList", "PackListItem"],
    "Equipment Item": ["Equipment"],
    "Event Layout": ["EventLayoutSection"],
    "Venue Logistics Snapshot": [
      "Venue.loadInInstructions",
      "Venue.logisticsNotes",
      "ProposalSection:venue_logistics",
    ],
  },
  "AC-200 venue": {
    "Venue Profile": ["Venue"],
    "Venue Note": ["VenueNote"],
    "Venue Layout Template": ["VenueLayoutTemplate"],
    "Venue Vendor Relationship": ["VenueVendorRelationship"],
    "Revenue Attribution/Split": ["RevenueAttribution", "VenueCommissionTerm"],
  },
  "AC-201 people": {
    "Staff Member": ["Person"],
    Role: ["Person.role"],
    "Role Scorecard": ["RoleScorecard"],
    "Candidate/Application": ["Candidate"],
    Interview: ["Interview"],
    "Performance Feedback": ["PerformanceReview"],
    "One-on-One": ["OneOnOne"],
  },
  "AC-202 migration": {
    "External Record Link": ["ExternalRecordLink"],
    "Import/Sync Run": ["ImportRun"],
    "Sync Error": ["SyncError"],
    "Payment/Reconciliation Record": ["Payment", "ImportConflict"],
    "Message Thread/Message": ["MessageThread", "Message"],
    "Integration Connection": ["IntegrationConnection"],
  },
};

function exists(ref: string): boolean {
  const enumMatch = ref.match(/^(\w+):(\w+)$/);
  if (enumMatch) {
    return Boolean(
      ir.enums
        .find((e) => e.name === enumMatch[1])
        ?.values.some((v) => v.name === enumMatch[2]),
    );
  }
  const commandMatch = ref.match(/^(\w+)\.(\w+)\(\)$/);
  if (commandMatch) {
    return ir.commands.some(
      (c) => c.entity === commandMatch[1] && c.name === commandMatch[2],
    );
  }
  const [name, property] = ref.split(".");
  const found = entity(name!);
  if (!found) return false;
  return property ? found.properties.some((p) => p.name === property) : true;
}

describe("spec record kinds map to existing Capsule records", () => {
  for (const [group, rows] of Object.entries(SPINE)) {
    it(group, () => {
      const missing = Object.entries(rows).flatMap(([specName, refs]) =>
        refs
          .filter((ref) => !exists(ref))
          .map((ref) => `${specName} -> ${ref}`),
      );
      expect(missing).toEqual([]);
    });
  }

  it("AC-367: no parallel CRM, event, pricing, menu or reporting record", () => {
    const parallel = ir.entities
      .map((e) => e.name)
      .filter((name) =>
        /^(Customer|Account|Company|Contact|Deal|Opportunity|Inquiry|Booking|CateringEvent|Job|PriceList|PriceBook|PricingRule|MenuCatalog|CatalogItem|Report|ReportRow|ReportLedger)$/.test(
          name,
        ),
      );
    expect(parallel).toEqual([]);
    const eventShaped = ir.entities.filter((e) =>
      ["startsAt", "endsAt", "expectedHeadcount", "clientId"].every((p) =>
        e.properties.some((prop) => prop.name === p),
      ),
    );
    expect(eventShaped.map((e) => e.name)).toEqual(["Event"]);
  });
});
