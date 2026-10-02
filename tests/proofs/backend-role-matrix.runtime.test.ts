/**
 * Runtime proof (PL-ROLE-PROOF, AC-684..AC-696; spec BE-20.3 security
 * matrix): every caller the spec names does its own ordinary work, and is
 * refused the work and private data of other areas.
 *
 * Callers: admin, sales, event manager, kitchen, inventory, logistics,
 * workforce manager, ordinary linked staff, finance, an outside agent (an API
 * key acts as its owner's own sign-in on the command address), another
 * company's admin, a sign-in with no staff profile, and a signed-out caller.
 * Every signed-in employee is a linked staff profile, so the role comes from
 * the profile, not from the sign-in.
 *
 * Checked for each caller: representative list reads (shown or empty),
 * representative steps (done, or refused with nothing written), and private
 * data: a coworker's email, phone and home address are hidden from roles that
 * do not manage staff (each person still sees their own), pay rates never ride
 * on the team list and only staff and finance managers read them. Another
 * company's admin, a sign-in with no profile and a signed-out caller see
 * nothing and change nothing. Synthetic workspaces only.
 */
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const HOME = "role-matrix-home";
const OTHER = "role-matrix-other";
const HOUR = 60 * 60 * 1000;
const CREW_EMAIL = "crew@role-matrix-home.test";
const CREW_PHONE = "555-010-4477";
const CREW_STREET = "12 Private Lane";
const CREW_RATE = 23.5;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Test = ReturnType<typeof convexTest>;
type Caller = Pick<Test, "query" | "mutation" | "run" | "fetch">;
type Doc = { docId: string };
// The generated function list is very large; calls go through these two
// loose aliases so the proof stays readable.
const Q = api.queries as unknown as Record<string, FunctionReference<"query">>;
const M = api.mutations as unknown as Record<
  string,
  FunctionReference<"mutation">
>;

async function read(caller: Caller, name: string, args = {}) {
  return (await caller.query(Q[name], args as never)) as Array<
    Record<string, unknown>
  >;
}
async function run(
  caller: Caller,
  name: string,
  args: Record<string, unknown>,
) {
  return (await caller.mutation(M[name], args as never)) as Doc;
}
async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

/** A staff profile hired by the workspace's first admin and linked to a sign-in. */
async function linked(t: Test, tenantId: string, label: string, role: string) {
  const boot = t.withIdentity({
    subject: `boot-${tenantId}`,
    tokenIdentifier: `boot|${tenantId}`,
    tenantId,
    role: "org:admin",
  });
  const subject = `user_${tenantId}_${label}`;
  const { docId } = await run(boot, "Person_createViaHire", {
    givenName: label,
    familyName: "Matrix",
    email: `${label}@${tenantId}.test`,
    role,
    employmentType: "full_time",
  });
  await run(boot, "Person_linkAccount", { docId, authSubjectId: subject });
  return {
    personId: docId,
    caller: t.withIdentity({
      subject,
      tokenIdentifier: `matrix|${subject}`,
      tenantId,
    }) as Caller,
  };
}

const ROLES = {
  admin: "admin",
  sales: "sales_staff",
  eventManager: "event_manager",
  kitchen: "kitchen_staff",
  inventory: "inventory_staff",
  logistics: "logistics_staff",
  workforce: "workforce_manager",
  staff: "staff",
  finance: "finance_staff",
} as const;
type Who = keyof typeof ROLES;

async function world() {
  const t = convexTest(schema, modules);
  const people = {} as Record<Who, { personId: string; caller: Caller }>;
  for (const [who, role] of Object.entries(ROLES)) {
    people[who as Who] = await linked(t, HOME, who, role);
  }
  const crew = await linked(t, HOME, "crew", "event_staff");
  const agent = await linked(t, HOME, "agent", "sales_staff");
  const foreign = await linked(t, OTHER, "foreign", "admin");
  const admin = people.admin.caller;

  // The crew member's private details.
  await run(admin, "Person_correctIdentity", {
    docId: crew.personId,
    givenName: "crew",
    familyName: "Matrix",
    phone: CREW_PHONE,
  });
  await run(admin, "Person_correctEmail", {
    docId: crew.personId,
    email: CREW_EMAIL,
  });
  await run(admin, "Person_changeAddress", {
    docId: crew.personId,
    addressLine1: CREW_STREET,
    city: "Springfield",
    postalCode: "01101",
  });
  await run(admin, "Person_setPayRate", {
    docId: crew.personId,
    hourlyRate: CREW_RATE,
  });

  // One record in every area, made by the admin.
  const client = await run(admin, "Client_createViaRegister", {
    clientType: "company",
    companyName: "Matrix Client Co",
  });
  const startsAt = Date.now() + 10 * 24 * HOUR;
  const event = await run(admin, "Event_createViaPlanEngagement", {
    clientId: client.docId,
    title: "Matrix dinner",
    eventType: "catering",
    startsAt,
    endsAt: startsAt + 5 * HOUR,
    expectedHeadcount: 40,
    primaryContactName: "Pat Planner",
    budgetAmount: 2000,
    quotedPrice: 2400,
  });
  const ingredient = await run(admin, "Ingredient_createViaIntroduce", {
    name: "Matrix flour",
    unit: "kilogram",
    costPerUnit: 2,
  });
  const location = await run(admin, "StorageLocation_createViaRegister", {
    name: "Matrix walk-in",
  });
  await run(admin, "InventoryItem_createViaOpen", {
    ingredientId: ingredient.docId,
    locationId: location.docId,
    unit: "kilogram",
    quantityOnHand: 5,
  });
  await run(admin, "Vehicle_createViaRegister", {
    make: "Ford",
    model: "Transit",
    registration: "MATRIX-1",
    ownership: "owned",
    payloadCapacityKg: 1200,
    operationalStatus: "available",
  });
  await run(admin, "Invoice_createViaIssue", {
    clientId: client.docId,
    invoiceNumber: "MATRIX-1",
    subtotal: 100,
    taxAmount: 0,
    discountAmount: 0,
    total: 100,
  });

  const unlinked = t.withIdentity({
    subject: "user_role_matrix_unlinked",
    tokenIdentifier: "matrix|unlinked",
    tenantId: HOME,
  }) as Caller;
  return {
    t,
    people,
    crew,
    agent,
    foreign,
    unlinked,
    anonymous: t as Caller,
    clientId: client.docId,
    eventId: event.docId,
    ingredientId: ingredient.docId,
    locationId: location.docId,
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** Which list reads show the workspace's record to each role. */
const READS: Record<string, Who[]> = {
  listClient: ["admin", "sales", "finance"],
  listEvent: Object.keys(ROLES) as Who[],
  listVehicle: Object.keys(ROLES) as Who[],
  listIngredient: [
    "admin",
    "eventManager",
    "kitchen",
    "inventory",
    "workforce",
  ],
  listInventoryItem: ["admin", "eventManager", "inventory", "workforce"],
  listStorageLocation: ["admin", "inventory"],
  listInvoice: ["admin", "eventManager", "workforce", "finance"],
};

/** A representative step for each area, with the roles that may take it. */
type Step = {
  name: string;
  allowed: Who[];
  args: (w: World, who: Who) => Record<string, unknown>;
  table: string;
};
const STEPS: Step[] = [
  {
    name: "Client_createViaRegister",
    allowed: ["admin", "sales"],
    table: "clients",
    args: (_w, who) => ({
      clientType: "company",
      companyName: `${who} client`,
    }),
  },
  {
    name: "Event_createViaPlanEngagement",
    allowed: ["admin", "sales", "eventManager"],
    table: "events",
    args: (w, who) => ({
      clientId: w.clientId,
      title: `${who} event`,
      eventType: "catering",
      startsAt: Date.now() + 20 * 24 * HOUR,
      endsAt: Date.now() + 20 * 24 * HOUR + 4 * HOUR,
      expectedHeadcount: 20,
      primaryContactName: "Pat Planner",
      budgetAmount: 1000,
      quotedPrice: 1200,
    }),
  },
  {
    name: "Ingredient_createViaIntroduce",
    allowed: ["admin", "kitchen"],
    table: "ingredients",
    args: (_w, who) => ({ name: `${who} salt`, unit: "gram", costPerUnit: 1 }),
  },
  {
    name: "StorageLocation_createViaRegister",
    allowed: ["admin", "inventory"],
    table: "storageLocations",
    args: (_w, who) => ({ name: `${who} shelf` }),
  },
  {
    name: "Vehicle_createViaRegister",
    allowed: ["admin", "eventManager", "logistics", "workforce"],
    table: "vehicles",
    args: (_w, who) => ({
      make: "Ford",
      model: "Transit",
      registration: `MX-${who}`,
      ownership: "leased",
      payloadCapacityKg: 900,
      operationalStatus: "available",
    }),
  },
  {
    name: "Person_createViaHire",
    allowed: ["admin", "workforce"],
    table: "people",
    args: (_w, who) => ({
      givenName: `${who}hire`,
      familyName: "Matrix",
      email: `${who}hire@role-matrix-home.test`,
      role: "staff",
      employmentType: "part_time",
    }),
  },
  {
    name: "Shift_createViaSchedule",
    allowed: ["admin", "workforce"],
    table: "shifts",
    // A different day for each caller, so shifts never overlap.
    args: (w, who) => {
      const day = 2 + Object.keys(ROLES).indexOf(who);
      return {
        personId: w.crew.personId,
        startsAt: Date.now() + day * 24 * HOUR,
        endsAt: Date.now() + day * 24 * HOUR + 6 * HOUR,
      };
    },
  },
];

async function count(t: Test, table: string) {
  return (await t.run(
    async (ctx) => (await ctx.db.query(table as never).collect()).length,
  )) as number;
}

describe("runtime proof: thirteen-caller access matrix (AC-684..AC-696)", () => {
  it("each role sees its own areas and nothing else", async () => {
    const w = await world();
    for (const [query, allowed] of Object.entries(READS)) {
      for (const who of Object.keys(ROLES) as Who[]) {
        const rows = await read(w.people[who].caller, query);
        expect({ who, query, shown: rows.length > 0 }).toEqual({
          who,
          query,
          shown: allowed.includes(who),
        });
      }
    }
  }, 120_000);

  it("each role takes its own steps and is refused the rest, with nothing written", async () => {
    const w = await world();
    for (const step of STEPS) {
      for (const who of Object.keys(ROLES) as Who[]) {
        const before = await count(w.t, step.table);
        const wasRefused = await refused(() =>
          run(w.people[who].caller, step.name, step.args(w, who)),
        );
        const after = await count(w.t, step.table);
        const allowed = step.allowed.includes(who);
        expect({ who, step: step.name, refused: wasRefused }).toEqual({
          who,
          step: step.name,
          refused: !allowed,
        });
        expect(after - before).toBe(allowed ? 1 : 0);
      }
    }

    // Role changes stay with the admin.
    for (const who of Object.keys(ROLES) as Who[]) {
      const crew = (await w.t.run(async (ctx) =>
        ctx.db.get(w.crew.personId as never),
      )) as { version: number };
      const wasRefused = await refused(() =>
        run(w.people[who].caller, "Person_assignRole", {
          docId: w.crew.personId,
          role: "event_manager",
          version: crew.version,
        }),
      );
      expect({ who, refused: wasRefused }).toEqual({
        who,
        refused: who !== "admin",
      });
      if (who === "admin") {
        await run(w.people.admin.caller, "Person_assignRole", {
          docId: w.crew.personId,
          role: "event_staff",
          version: crew.version + 1,
        });
      }
    }
  }, 180_000);

  it("ordinary staff clock in for themselves, never for someone else", async () => {
    const w = await world();
    const staff = w.people.staff;
    const own = await run(staff.caller, "TimeRecord_createViaClockIn", {
      personId: staff.personId,
      timeZone: "America/New_York",
    });
    const mine = await read(staff.caller, "listTimeRecord");
    expect(mine.map((row) => row._id)).toEqual([own.docId]);
    expect(
      await refused(() =>
        run(staff.caller, "TimeRecord_createViaClockIn", {
          personId: w.crew.personId,
          timeZone: "America/New_York",
        }),
      ),
    ).toBe(true);
    expect(await count(w.t, "timeRecords")).toBe(1);
  }, 60_000);

  it("a coworker's contact details and pay stay private", async () => {
    const w = await world();
    const managesStaff: Who[] = ["admin", "workforce"];
    const readsRates: Who[] = ["admin", "workforce"];
    for (const who of Object.keys(ROLES) as Who[]) {
      const caller = w.people[who].caller;
      const crew = (await read(caller, "listPerson")).find(
        (row) => row._id === w.crew.personId,
      );
      expect(crew).toBeDefined();
      expect(crew?.hourlyRate).toBeUndefined();
      const text = JSON.stringify(crew);
      const open = managesStaff.includes(who);
      expect({ who, email: text.includes(CREW_EMAIL) }).toEqual({
        who,
        email: open,
      });
      expect({ who, phone: text.includes(CREW_PHONE) }).toEqual({
        who,
        phone: open,
      });
      expect({ who, street: text.includes(CREW_STREET) }).toEqual({
        who,
        street: open,
      });
      const rates = await caller.query(api.laborSummary.listPayRates, {});
      expect({ who, rates: rates !== null }).toEqual({
        who,
        rates: readsRates.includes(who),
      });
      if (rates) {
        expect(
          rates.find((row) => row.personId === w.crew.personId)?.hourlyRate,
        ).toBe(CREW_RATE);
      }
    }
    // Each person still sees their own details.
    const self = (await read(w.crew.caller, "listPerson")).find(
      (row) => row._id === w.crew.personId,
    );
    const ownText = JSON.stringify(self);
    expect(ownText).toContain(CREW_EMAIL);
    expect(ownText).toContain(CREW_PHONE);
    expect(ownText).toContain(CREW_STREET);
    expect(self?.hourlyRate).toBeUndefined();
  }, 120_000);

  it("an outside agent acts as its owner on the command address, with the owner's rights", async () => {
    const w = await world();
    const post = async (caller: Caller, path: string, body: object) => {
      const response = await caller.fetch(`/api/manifest/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        ...((await response.json()) as { data?: Doc; error?: string }),
      };
    };
    const made = await post(w.agent.caller, "Client/commands/register", {
      clientType: "company",
      companyName: "Agent client",
      tenantId: OTHER,
    });
    expect(made.status).toBe(200);
    const row = (await w.t.run(async (ctx) =>
      ctx.db.get(made.data?.docId as never),
    )) as { tenantId: string };
    expect(row.tenantId).toBe(HOME);
    // The agent reads what its owner reads.
    const clients = await read(w.agent.caller, "listClient");
    expect(clients.map((c) => c.companyName).sort()).toEqual([
      "Agent client",
      "Matrix Client Co",
    ]);
    expect(await read(w.agent.caller, "listInvoice")).toEqual([]);
    // A step its owner may not take is refused, and nothing is written.
    const before = await count(w.t, "ingredients");
    const denied = await post(w.agent.caller, "Ingredient/commands/introduce", {
      name: "Agent pepper",
      unit: "gram",
      costPerUnit: 1,
    });
    expect(denied.status).toBe(400);
    expect(await count(w.t, "ingredients")).toBe(before);
    // Without a key (no sign-in) nothing runs.
    const noKey = await post(w.anonymous, "Client/commands/register", {
      clientType: "company",
      companyName: "No key client",
      tenantId: HOME,
    });
    expect(noKey.status).toBe(401);
  }, 60_000);

  it("another company, a sign-in with no profile and a signed-out caller see and change nothing", async () => {
    const w = await world();
    const outsiders: Array<[string, Caller]> = [
      ["foreign", w.foreign.caller],
      ["unlinked", w.unlinked],
      ["anonymous", w.anonymous],
    ];
    for (const [who, caller] of outsiders) {
      for (const query of [...Object.keys(READS), "listPerson"]) {
        const rows = await read(caller, query);
        expect({ who, query, rows: rows.length }).toEqual({
          who,
          query,
          // The other company's admin sees only its own profile.
          rows: who === "foreign" && query === "listPerson" ? 1 : 0,
        });
      }
      expect(
        await caller.query(api.queries.getClient, { id: w.clientId as never }),
      ).toBeNull();
      expect(
        await caller.query(api.queries.getEvent, { id: w.eventId as never }),
      ).toBeNull();
      // The other company's admin reads its own staff's rates only.
      const rates = await caller.query(api.laborSummary.listPayRates, {});
      expect({ who, rates: rates === null }).toEqual({
        who,
        rates: who !== "foreign",
      });
      expect(JSON.stringify(rates)).not.toContain(w.crew.personId);

      const clientBefore = (await w.t.run(async (ctx) =>
        ctx.db.get(w.clientId as never),
      )) as { version: number };
      expect(
        await refused(() =>
          run(caller, "Client_changeContact", {
            docId: w.clientId,
            email: `${who}@takeover.test`,
            version: clientBefore.version,
          }),
        ),
      ).toBe(true);
      expect(
        await refused(() =>
          run(caller, "Person_assignRole", {
            docId: w.crew.personId,
            role: "admin",
          }),
        ),
      ).toBe(true);
      const clientAfter = (await w.t.run(async (ctx) =>
        ctx.db.get(w.clientId as never),
      )) as { version: number; tenantId: string };
      expect(clientAfter.version).toBe(clientBefore.version);
      const crew = (await w.t.run(async (ctx) =>
        ctx.db.get(w.crew.personId as never),
      )) as { role: string };
      expect(crew.role).toBe("event_staff");
    }

    // A record made by the other company stays in that company.
    const own = await run(w.foreign.caller, "Client_createViaRegister", {
      clientType: "company",
      companyName: "Other company client",
    });
    const ownRow = (await w.t.run(async (ctx) =>
      ctx.db.get(own.docId as never),
    )) as { tenantId: string };
    expect(ownRow.tenantId).toBe(OTHER);
    expect(
      (await read(w.people.sales.caller, "listClient")).map(
        (c) => c.companyName,
      ),
    ).toEqual(["Matrix Client Co"]);

    // Nothing the outsiders tried was written in the home company.
    expect(
      await refused(() =>
        run(w.unlinked, "Client_createViaRegister", {
          clientType: "company",
          companyName: "Unlinked client",
        }),
      ),
    ).toBe(true);
    expect(
      await refused(() =>
        run(w.anonymous, "Client_createViaRegister", {
          clientType: "company",
          companyName: "Anonymous client",
        }),
      ),
    ).toBe(true);
    expect(await count(w.t, "clients")).toBe(2);
  }, 120_000);
});
