/**
 * Runtime proof (AC-180, PL-SOURCE-IDENTITY): each kind of source record is
 * kept apart - its own recordType on the link and a record of the right
 * Capsule type - never one generic row. A person and a company from one
 * contacts file stay different kinds of client.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
  type Row,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("runtime proof: source kinds stay typed (AC-180)", () => {
  it("each imported source kind lands under its own recordType and correctly typed capsule entity", async () => {
    const tenantId = "tenant-import-entity-typing";
    const actor = ownerOf(tenantId);

    await importRows(actor, "contacts", [
      { CompanyID: "K-1", CompanyName: "Harbor Events LLC" },
      {
        ContactID: "K-1",
        FirstName: "Ivy",
        LastName: "Nash",
        CompanyID: "K-1",
      },
    ]);
    await importRows(actor, "venues", [
      { VenueID: "K-1", VenueName: "Pier 9" },
    ]);
    await importRows(actor, "leads", [
      {
        LeadID: "K-1",
        OpportunityName: "Nash Gala",
        Stage: "New",
        EstimatedValue: 5000,
      },
    ]);
    await importRows(actor, "events", [
      {
        EventID: "K-1",
        EventName: "Nash Gala",
        EventDate: "2026-12-05",
        StartTime: "18:00",
        EndTime: "22:00",
        ExpectedCount: 60,
        VenueID: "K-1",
        ClientID: "K-1",
        EventStatus: "Definite",
      },
    ]);
    await importRows(actor, "menus", [
      {
        MenuItemID: "K-1",
        Name: "Crab Cakes",
        Category: "Appetizer",
        PortionSizeDescription: "2 pieces",
      },
    ]);

    // One old-system id ("K-1") used by six kinds: six links, six records.
    const all = (await links(actor, tenantId)).filter(
      (l) => l.externalId === "K-1",
    );
    const kinds = Object.fromEntries(
      all.map((l) => [String(l.recordType), String(l.capsuleEntity)]),
    );
    expect(kinds).toEqual({
      company: "client",
      contact: "client",
      venue: "venue",
      lead: "lead",
      event: "event_record",
      menu: "dish",
    });
    expect(new Set(all.map((l) => l.capsuleId)).size).toBe(6);

    const byType = (t: string) =>
      all.find((l) => l.recordType === t)!.capsuleId;
    const get = (query: unknown, id: unknown) =>
      actor.query(query as never, { id: id as never }) as Promise<Row | null>;
    expect(await get(api.queries.getClient, byType("company"))).toMatchObject({
      clientType: "company",
      companyName: "Harbor Events LLC",
    });
    expect(await get(api.queries.getClient, byType("contact"))).toMatchObject({
      clientType: "person",
      givenName: "Ivy",
      companyName: "Harbor Events LLC",
    });
    expect(await get(api.queries.getVenue, byType("venue"))).toMatchObject({
      name: "Pier 9",
    });
    expect(await get(api.queries.getLead, byType("lead"))).toMatchObject({
      displayName: "Nash Gala",
      stage: "new",
    });
    expect(await get(api.queries.getEvent, byType("event"))).toMatchObject({
      title: "Nash Gala",
    });
    expect(await get(api.queries.getDish, byType("menu"))).toMatchObject({
      name: "Crab Cakes",
    });
  });
});
