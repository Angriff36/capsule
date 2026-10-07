/**
 * Runtime proof (PL-AUTH, AC-212 report pickers): the report picker lists
 * (tppReports.options.list) show events, clients, people, vendors and venues
 * only to a caller who may read those records under their generated read
 * policy. Removed records never show. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

const tenantId = "tenant-report-picker-reads";
const day = Date.UTC(2026, 8, 20);
// The event picker adds the date (local time) so same-named events tell apart.
const gala = `Harbor Gala · ${new Date(day).toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})}`;

/** The labels of each picker list the caller gets. */
async function pickers(actor: Actor) {
  const options = (await actor.query(
    api.tppReports.options.list,
    {},
  )) as Record<
    "events" | "clients" | "people" | "vendors" | "venues",
    { label: string }[]
  >;
  const labels = (rows: { label: string }[]) => rows.map((row) => row.label);
  return {
    events: labels(options.events),
    clients: labels(options.clients),
    people: labels(options.people),
    vendors: labels(options.vendors),
    venues: labels(options.venues),
  };
}

async function seed(owner: Actor) {
  await owner.run(async (ctx) => {
    const base = {
      tenantId,
      version: 1,
      createdAt: day,
      updatedAt: day,
      deletedAt: null,
    };
    const insert = (table: string, doc: Record<string, unknown>) =>
      ctx.db.insert(table as never, { ...base, ...doc } as never);
    await insert("events", {
      title: "Harbor Gala",
      eventType: "gala",
      stage: "planning",
      startsAt: day,
    });
    await insert("clients", {
      clientType: "company",
      companyName: "Harbor Foods",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
    });
    await insert("clients", {
      clientType: "company",
      companyName: "Removed Co",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      deletedAt: day,
    });
    await insert("people", {
      givenName: "Pat",
      familyName: "Cook",
      email: "pat@example.test",
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
    });
    await insert("vendors", {
      name: "Fresh Fish Co",
      paymentTermsDays: 30,
      status: "active",
    });
    await insert("venues", {
      name: "Pier Hall",
      venueType: "banquet_hall",
      capacity: 200,
      status: "active",
    });
  });
}

describe("runtime proof: report pickers follow each record read policy (AC-212)", () => {
  it("lists only the records the caller may read", async () => {
    const proof = harness();
    const as = (role: string) =>
      proof.asRole({ subject: "report-picker-" + role, role, tenantId });
    const owner = as("owner");
    await seed(owner);

    // Control: the owner sees every live record, never the removed client.
    expect(await pickers(owner)).toEqual({
      events: [gala],
      clients: ["Harbor Foods"],
      people: ["Pat Cook"],
      vendors: ["Fresh Fish Co"],
      venues: ["Pier Hall"],
    });

    // Sales reads events, clients and people, not vendors or venues.
    const sales = await pickers(as("sales_staff"));
    expect(sales.events).toEqual([gala]);
    expect(sales.clients).toEqual(["Harbor Foods"]);
    expect(sales.people).toEqual(["Pat Cook"]);
    expect(sales.vendors).toEqual([]);
    expect(sales.venues).toEqual([]);

    // Finance reads clients, not vendors or venues.
    const finance = await pickers(as("finance_staff"));
    expect(finance.clients).toEqual(["Harbor Foods"]);
    expect(finance.vendors).toEqual([]);
    expect(finance.venues).toEqual([]);

    // Procurement reads vendors, not clients.
    const procurement = await pickers(as("procurement_staff"));
    expect(procurement.vendors).toEqual(["Fresh Fish Co"]);
    expect(procurement.clients).toEqual([]);

    // An event manager reads venues, not clients or vendors.
    const eventManager = await pickers(as("event_manager"));
    expect(eventManager.venues).toEqual(["Pier Hall"]);
    expect(eventManager.clients).toEqual([]);
    expect(eventManager.vendors).toEqual([]);

    // A driver reads events and people only.
    expect(await pickers(as("driver"))).toEqual({
      events: [gala],
      clients: [],
      people: ["Pat Cook"],
      vendors: [],
      venues: [],
    });
  });
});
