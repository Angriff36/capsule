/**
 * Runtime proof (PL-SOURCE-DATASETS, AC-063): TPP's Address / Phone List
 * report, read from its file with the printed headings, imports as clients:
 * address and ZIP land on the client, a person's printed company becomes
 * their company name, a company-only row is a company client, a row with no
 * name is refused, and the same file again makes nothing new. Type, Inactive
 * and Account stay on the import link as written.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { sourceRowsFromGrid } from "../../src/lib/importSourceFile";
import { parseCsv } from "../../src/lib/tppMenuCsv";
import {
  client,
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

const { rows } = sourceRowsFromGrid(
  parseCsv(
    readFileSync(
      new URL(
        "../fixtures/tpp-reports/address-phone-list-sample.csv",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  "contacts",
);

describe("runtime proof: the Address / Phone List file imports as clients", () => {
  it("lands address, ZIP and company; refuses a nameless row; repeats as no change", async () => {
    const tenantId = "tenant-report-file-contacts";
    const actor = ownerOf(tenantId);

    const first = await importRows(actor, "contacts", rows);
    expect(first).toMatchObject({ committed: 5, pending: 0 });

    const all = await links(actor, tenantId);
    expect(all).toHaveLength(5);
    const clients = await Promise.all(
      all.map(async (link) => ({
        link,
        record: (await client(actor, link.capsuleId))!,
      })),
    );
    const find = (test: (record: any) => boolean) =>
      clients.find(({ record }) => test(record));

    expect(find((r) => r.givenName === "Lena")?.record).toMatchObject({
      clientType: "person",
      familyName: "Hartwell",
      addressLine1: "12 Example St",
      city: "Spokane",
      region: "WA",
      postalCode: "99201",
      email: "lena@example.com",
    });
    expect(find((r) => r.givenName === "Jon")?.record).toMatchObject({
      familyName: "Vale",
      companyName: "Example Studios",
    });
    expect(
      find((r) => r.companyName === "Example Hall Co")?.record,
    ).toMatchObject({
      clientType: "company",
      addressLine1: "100 Main St",
      postalCode: "99202",
    });
    // Single name stays single; nothing made up.
    const frank = find((r) => r.givenName === "Frank")!;
    expect(frank.record.familyName ?? "").toBe("");
    // The columns with no Capsule field are kept on the link as written.
    expect(
      JSON.parse(String(frank.link.rawSourceData)).sourceRow,
    ).toMatchObject({
      Inactive: "False",
      Account: "A00002",
    });

    const again = await importRows(actor, "contacts", rows);
    expect(again.committed).toBe(0);
    expect(await links(actor, tenantId)).toHaveLength(5);
  });
});
