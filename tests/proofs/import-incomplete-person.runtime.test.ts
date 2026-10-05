/**
 * Runtime proof (AC-060, PL-SOURCE-IDENTITY): incomplete source people and
 * companies import as written. No fake surname, email address or default
 * location is added; international phone and address text and the original
 * spelling stay exactly as the old system had them.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  client,
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("runtime proof: incomplete people import without made-up values (AC-060)", () => {
  it("a single-name contact imports with unknown family name and no fabricated email or address", async () => {
    const tenantId = "tenant-incomplete-person";
    const actor = ownerOf(tenantId);

    const result = await importRows(actor, "contacts", [
      { ContactID: "P-1", FirstName: "Madonna" },
      { ContactID: "P-2", LastName: "Prince" },
      {
        ContactID: "P-3",
        FirstName: "Zoë",
        LastName: "Ðurić-Ångström",
        Phone: "+44 20 7946 0958 ext. 12",
        Address: "Flat 2, 14 Rue de l'Église",
        City: "Saint-Étienne",
        ZipCode: "42000 CEDEX 1",
      },
      { CompanyID: "CO-9", CompanyName: "Café Ñandú S.A." },
    ]);
    expect(result).toMatchObject({ committed: 4, pending: 0 });

    const all = await links(actor, tenantId);
    const read = async (id: string) =>
      (await client(actor, all.find((l) => l.externalId === id)!.capsuleId))!;

    for (const [id, name] of [
      ["P-1", "Madonna"],
      ["P-2", "Prince"],
    ] as const) {
      const person = await read(id);
      expect(person).toMatchObject({ clientType: "person", givenName: name });
      expect(person.familyName ?? "").toBe("");
      expect(person.email ?? null).toBeNull();
      expect(person.addressLine1 ?? null).toBeNull();
      expect(person.city ?? null).toBeNull();
      expect(person.region ?? null).toBeNull();
      expect(person.countryCode ?? null).toBeNull();
    }

    expect(await read("P-3")).toMatchObject({
      givenName: "Zoë",
      familyName: "Ðurić-Ångström",
      phone: "+44 20 7946 0958 ext. 12",
      addressLine1: "Flat 2, 14 Rue de l'Église",
      city: "Saint-Étienne",
      postalCode: "42000 CEDEX 1",
    });

    // A company with no named contact is a company client of its own.
    const company = await read("CO-9");
    expect(company).toMatchObject({
      clientType: "company",
      companyName: "Café Ñandú S.A.",
    });
    expect(company.email ?? null).toBeNull();
    expect(company.givenName ?? "").toBe("");
  });

  it("a row with no name at all is refused, not given one", async () => {
    const tenantId = "tenant-incomplete-person-noname";
    const actor = ownerOf(tenantId);
    const result = await importRows(actor, "contacts", [
      { ContactID: "P-9", Email: "who@x.example" },
      { ContactID: "P-10", FirstName: "Rumi" },
    ]);
    expect(result.committed).toBe(1);
    const all = await links(actor, tenantId);
    expect(all.map((l) => l.externalId)).toEqual(["P-10"]);
  });
});
