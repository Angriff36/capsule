/**
 * Shared world for the golden-event journey proof (PL-NATIVE-JOURNEY,
 * AC-653..AC-674): ONE tenant, ONE golden Event and one competing Event in
 * the same purchasing week, stable identities across every step. The test
 * file walks the 22 steps in order over this one world; this file only seeds
 * and reads (assertion-free).
 */
import { api } from "../../convex/_generated/api";
import {
  harness,
  liveRows,
  readRow,
  rolesFor,
  runner,
  seedCatalog,
  type Catalog,
  type Proof,
  type Role,
} from "./weekly-purchasing.runtime.helpers";

export { liveRows, readRow };
export type { Proof, Role };

const M = api.mutations;

export const TENANT = "tenant-golden-event";
export const OWNER_SUBJECT = `owner-${TENANT}`;

/** Monday 1 March 2027; the purchasing week key is Monday 08:00 UTC. */
export const WEEK = {
  key: Date.UTC(2027, 2, 1, 8, 0),
  golden: {
    startsAt: Date.UTC(2027, 2, 3, 17, 0),
    endsAt: Date.UTC(2027, 2, 3, 22, 0),
  },
  rival: {
    startsAt: Date.UTC(2027, 2, 5, 17, 0),
    endsAt: Date.UTC(2027, 2, 5, 22, 0),
  },
} as const;

export const FACTS = {
  headcount: 80,
  rivalHeadcount: 50,
  newHeadcount: 100,
  flourPerServing: 0.1,
  saltPerServing: 0.01,
  flourStock: 5,
  breadPrice: 6,
  saltedPrice: 4,
} as const;

/** The quote form the prospect fills in once (step 01). */
export const QUOTE = {
  clientName: "Morgan Golden",
  email: "morgan-golden@example.com",
  phone: "555-0142",
  eventEndTime: WEEK.golden.endsAt,
  guestCount: FACTS.headcount,
  consent: true,
  serviceStyleText: "Full-service buffet",
  occasionText: "Company anniversary",
  venueName: "Hillside Lawn",
  venueAddress: "4 Orchard Road",
  menuPreferences: "Breads and a salted course",
  dietaryRestrictions: "Two vegetarian guests",
  notes: "Rain plan needed",
} as const;

export type World = {
  proof: Proof;
  owner: Role;
  roles: ReturnType<typeof rolesFor>;
  run: {
    owner: ReturnType<typeof runner>;
    sales: ReturnType<typeof runner>;
    events: ReturnType<typeof runner>;
    kitchen: ReturnType<typeof runner>;
  };
  catalog: Catalog;
  menuId: string;
};

/** Organization, kitchen catalog (two kilogram ingredients behind two
 * published recipes and two dishes), flour stock, the weekly purchasing
 * vendor, and one published priced menu. Real commands only. */
export async function seedWorld(): Promise<World> {
  const proof = harness();
  const owner = proof.asRole({
    subject: OWNER_SUBJECT,
    role: "owner",
    tenantId: TENANT,
  });
  const roles = rolesFor(proof, TENANT);
  const run = {
    owner: runner(proof, owner),
    sales: runner(proof, roles.sales),
    events: runner(proof, roles.events),
    kitchen: runner(proof, roles.kitchen),
  };
  await run.owner(M.Organization_createViaRegister, {
    name: "Golden Kitchen LLC",
    brandDisplayName: "Golden Kitchen Catering",
  });
  const catalog = await seedCatalog(proof, TENANT, [
    {
      name: "Golden flour",
      perServing: FACTS.flourPerServing,
      stock: FACTS.flourStock,
    },
    { name: "Golden salt", perServing: FACTS.saltPerServing },
  ]);
  const menu = await run.owner(M.Menu_createViaDraft, { name: "Golden menu" });
  await run.owner(M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: catalog.dishIds[0],
    sellingPrice: FACTS.breadPrice,
  });
  await run.owner(M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: catalog.dishIds[1],
    sellingPrice: FACTS.saltedPrice,
  });
  await run.owner(M.Menu_markPublished, { docId: menu.docId });
  return { proof, owner, roles, run, catalog, menuId: menu.docId };
}

/** The proof-kit actor type declares mutations only; the convex-test
 * instance under it also runs actions (the quote form is an action). */
export function action<T>(
  actor: Role,
  fn: unknown,
  args: Record<string, unknown>,
): Promise<T> {
  return (
    actor as unknown as {
      action: (f: unknown, a: unknown) => Promise<unknown>;
    }
  ).action(fn, args) as Promise<T>;
}

/** The operator who signs governed commands needs a linked Person. */
export async function seedOperatorPerson(w: World): Promise<string> {
  return (await w.proof.seedEntity(w.owner, "people", {
    tenantId: TENANT,
    givenName: "Golden",
    familyName: "Owner",
    email: `${OWNER_SUBJECT}@example.com`,
    role: "owner",
    employmentType: "full_time",
    status: "active",
    authSubjectId: OWNER_SUBJECT,
    version: 1,
  })) as unknown as string;
}

export async function versionOf(w: World, docId: string): Promise<number> {
  return (await readRow<{ version: number }>(w.owner, docId)).version;
}

type Tenanted = { tenantId: string; deletedAt?: unknown };

/** Live rows of one table that point at one event. */
export async function eventRows<T extends Tenanted>(
  w: World,
  table: string,
  eventId: string,
): Promise<T[]> {
  return (
    await liveRows<T & { eventId?: string }>(w.owner, table, TENANT)
  ).filter((row) => row.eventId === eventId);
}

export type LedgerRow = {
  type: string;
  entityId: string;
  payload: Record<string, unknown>;
};

/** Manifest ledger rows of one type (optionally for one entity). */
export async function emitted(
  w: World,
  type: string,
  entityId?: string,
): Promise<LedgerRow[]> {
  const rows = (await w.owner.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as unknown as LedgerRow[];
  return rows.filter(
    (row) =>
      row.type === type && (entityId == null || row.entityId === entityId),
  );
}
