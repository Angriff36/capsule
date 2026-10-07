/**
 * Runtime proof (PL-SOURCE-DATASETS, AC-057 / PR02-01): every column of every
 * old-system source file has a stated home. A column fills a Capsule record
 * field, or stays with the row on the import link as written with the reason
 * it is not on the record. Nothing in a source file is dropped unannounced.
 * The files are the real headings with made-up rows.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GOODSHUFFLE_COLUMNS,
  goodshuffleSheetRows,
} from "../../src/lib/goodshuffleItems";
import {
  sourceRowsFromGrid,
  TPP_ADDRESS_LIST_KEPT,
} from "../../src/lib/importSourceFile";
import { TPP_EVENT_LIST_COLUMNS } from "../../src/lib/tppEventListColumns";
import { TPP_FIELD_DISPOSITIONS } from "../../src/lib/tppFieldDisposition";
import {
  parseCsv,
  TPP_MENU_COLUMNS,
  tppMenuTableToRows,
} from "../../src/lib/tppMenuCsv";
import { TPP_STAFF_LIST_COLUMNS } from "../../src/lib/tppStaffList";
import {
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

const grid = (path: string) =>
  parseCsv(
    readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8"),
  );

/** Every documented field name of the blocks a dataset reads. */
const documented = (...blocks: string[]) =>
  new Set(
    blocks.flatMap((block) => Object.keys(TPP_FIELD_DISPOSITIONS[block]!)),
  );

describe("runtime proof: every source dataset maps, keeps or reports each present field", () => {
  it("the Address / Phone List: each heading fills a contact field or is kept with a reason", () => {
    const read = sourceRowsFromGrid(
      grid("tpp-reports/address-phone-list-sample.csv"),
      "contacts",
    );
    const fields = documented("TPP_CONTACT_MAPPINGS", "TPP_COMPANY_MAPPINGS");
    for (const { heading, field } of read.matched)
      expect(fields.has(field), `${heading} -> ${field}`).toBe(true);
    expect(read.keptAsWritten.sort()).toEqual(
      Object.keys(TPP_ADDRESS_LIST_KEPT).sort(),
    );
    expect(read.matched.length + read.keptAsWritten.length).toBe(
      grid("tpp-reports/address-phone-list-sample.csv")[0]!.length,
    );
  });

  it("the 27-column event export: the reader puts each column where the inventory says", () => {
    const headings = grid("tpp-reports/event-list-27-columns-sample.csv")[0]!;
    expect(headings.slice().sort()).toEqual(
      Object.keys(TPP_EVENT_LIST_COLUMNS).sort(),
    );
    const read = sourceRowsFromGrid(
      grid("tpp-reports/event-list-27-columns-sample.csv"),
      "events",
    );
    const matched = new Map(read.matched.map((m) => [m.heading, m.field]));
    for (const heading of headings) {
      const home = TPP_EVENT_LIST_COLUMNS[heading]!;
      if ("field" in home)
        expect(matched.get(heading), heading).toBe(home.field);
      else {
        expect(read.keptAsWritten, heading).toContain(heading);
        expect(home.kept.length, heading).toBeGreaterThan(10);
      }
    }
  });

  it("the Menu Items Export: each column fills a dish field or is kept with a reason, and lands on the import link", async () => {
    const sheet = grid("tpp-reports/menu-items-export-sample.csv");
    expect(sheet[0]!.slice().sort()).toEqual(
      Object.keys(TPP_MENU_COLUMNS).sort(),
    );
    for (const [column, home] of Object.entries(TPP_MENU_COLUMNS))
      if (home.goesTo === "kept")
        expect(home.note.length, column).toBeGreaterThan(10);

    const read = tppMenuTableToRows(sheet);
    expect(read.keptAsWritten).toEqual([
      "Stations",
      "Item Status",
      "Created Date",
      "Last Changed Date",
    ]);

    const tenantId = "tenant-import-coverage-menus";
    const actor = ownerOf(tenantId);
    const result = await importRows(actor, "menus", read.rows);
    expect(result).toMatchObject({ committed: 3, pending: 0 });

    const menuLinks = (await links(actor, tenantId)).filter(
      (link) => link.recordType === "menu",
    );
    expect(menuLinks).toHaveLength(3);
    const pizza = menuLinks
      .map((link) => JSON.parse(String(link.rawSourceData)))
      .find((raw) => raw.name === '10" Example Pizza');
    expect(pizza.sourceRow).toMatchObject({
      price_per_person: 0,
      portion_size_description: "1 Pizza",
      kept_columns: {
        Stations: "Finish Kitchen",
        "Item Status": "Active",
        "Created Date": "3/23/2020 3:00 PM",
        "Last Changed Date": "10/1/2021 4:31 PM",
      },
    });
  });

  it("the Goodshuffle equipment export: every column is named in the equipment inventory", () => {
    const { rows } = goodshuffleSheetRows(
      grid("goodshuffle/inventory-export-sample.csv"),
    );
    const inventory = GOODSHUFFLE_COLUMNS.map((entry) => entry.column).join(
      " | ",
    );
    for (const entry of GOODSHUFFLE_COLUMNS)
      expect(entry.note.length, entry.column).toBeGreaterThan(2);
    const unnamed = Object.keys(rows[0]!).filter((heading) => {
      if (!heading) return false;
      const base = heading.replace(/^Attr::/, "");
      // "...Visible on ECommerce" names every web-shop display switch.
      if (base.endsWith(" Visible on ECommerce")) return false;
      return (
        !inventory.includes(base) &&
        !inventory.includes(`::${base.split("::").pop()}`)
      );
    });
    expect(unnamed).toEqual([]);
  });

  it("the Staff Address & Phone List: every heading has a home on the person", () => {
    const heading = [
      "Staff Member",
      "Home",
      "Work",
      "Mobile",
      "Email",
      "Address",
    ];
    const named = TPP_STAFF_LIST_COLUMNS.map((entry) => entry.column);
    expect(heading.filter((column) => !named.includes(column))).toEqual([]);
    for (const entry of TPP_STAFF_LIST_COLUMNS)
      expect(entry.note.length, entry.column).toBeGreaterThan(2);
  });
});
