/**
 * Runtime proof (PL-SOURCE-DATASETS): TPP's event list report (the real
 * 2,505-event history file prints "Invoice No", the client by name, no event
 * name and statuses like "3- Final") imports as events. Each event finds its
 * client by name among the clients read in from the contact list, takes a
 * "<client> <occasion>" title and its guest count, and a booked event that is
 * over comes in completed, a Cancelled one, a lost quote or a quote whose
 * date passed cancelled. An
 * unknown client or two clients with one name leave the event waiting with a
 * plain note; the same file again makes nothing new.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { sourceRowsFromGrid } from "../../src/lib/importSourceFile";
import { parseCsv } from "../../src/lib/tppMenuCsv";
import {
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
  tableRows,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

const fileRows = (name: string, dataset: string) =>
  sourceRowsFromGrid(
    parseCsv(
      readFileSync(
        new URL(`../fixtures/tpp-reports/${name}`, import.meta.url),
        "utf8",
      ),
    ),
    dataset,
  ).rows;

describe("runtime proof: the TPP event list file imports as events", () => {
  it("links clients by name, copies finished statuses, holds unknown and doubled names", async () => {
    const tenantId = "tenant-event-list-report";
    const actor = ownerOf(tenantId);

    await importRows(
      actor,
      "contacts",
      fileRows("address-phone-list-sample.csv", "contacts"),
    );
    // Two clients with one name.
    await importRows(actor, "contacts", [
      { ContactID: "S1", FirstName: "Sam", LastName: "Lee", Email: "a@x.test" },
      { ContactID: "S2", FirstName: "Sam", LastName: "Lee", Email: "b@x.test" },
    ]);

    const rows = fileRows("event-list-sample.csv", "events");
    expect(rows[0]).toMatchObject({
      EventID: "9101",
      ExpectedCount: "30",
      ClientFirstName: "Lena",
      ClientLastName: "Hartwell",
      Occasion: "Wedding",
    });

    const first = await importRows(actor, "events", rows);
    expect(first).toMatchObject({ committed: 5, pending: 2 });

    const clients = await tableRows(actor, "clients", tenantId);
    const clientId = (test: (c: Record<string, unknown>) => boolean) =>
      clients.find(test)?._id;
    const lena = clientId((c) => c.givenName === "Lena");
    const hall = clientId((c) => c.companyName === "Example Hall Co");
    const jon = clientId((c) => c.givenName === "Jon");

    const events = await tableRows(actor, "events", tenantId);
    const byTitle = (title: string) => events.find((e) => e.title === title);

    expect(byTitle("Lena Hartwell Wedding")).toMatchObject({
      clientId: lena,
      expectedHeadcount: 30,
      stage: "completed",
    });
    expect(byTitle("Example Hall Co Corporate Event")).toMatchObject({
      clientId: hall,
      stage: "cancelled",
      cancellationReason: "Cancelled in the old system",
    });
    expect(byTitle("Example Studios Birthday")).toMatchObject({
      clientId: jon,
      stage: "cancelled",
      cancellationReason: "Quote lost in the old system",
    });
    // A quote whose date passed was never booked.
    expect(byTitle("Lena Hartwell Graduation")).toMatchObject({
      stage: "cancelled",
      cancellationReason: "Quote not booked in the old system before its date",
    });
    // A confirmed event still to come stays in Planning.
    expect(byTitle("Lena Hartwell Anniversary")).toMatchObject({
      clientId: lena,
      stage: "planning",
    });

    const eventLinks = (await links(actor, tenantId)).filter(
      (l) => l.recordType === "event",
    );
    const note = (id: string) =>
      eventLinks.find((l) => l.externalId === id)?.resolutionNote;
    expect(note("9105")).toBe(
      "No client named Nobody Known; import the contact list first, then read this file again.",
    );
    expect(note("9106")).toBe(
      "2 clients are named Sam Lee; merge them or read the file again after one is renamed.",
    );

    const again = await importRows(actor, "events", rows);
    expect(again.committed).toBe(0);
    expect(await tableRows(actor, "events", tenantId)).toHaveLength(5);
  });
});
