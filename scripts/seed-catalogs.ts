/**
 * One-shot idempotent seed for the operational catalogs (issues #113/#119):
 * Occasion, ServiceStyle, ReferralSource. Values come from the TPP master
 * export (work/tpp-raw-master-2021-2026.csv value tallies) plus Josh's four
 * canonical service styles.
 *
 *   bun run agent:mint-jwt        # sign into Capsule UI first (target org selected)
 *   bun scripts/seed-catalogs.ts
 *
 * Targets CONVEX_URL || VITE_CONVEX_URL, authed via CAPSULE_AGENT_JWT
 * (reminted automatically when expired). Re-running skips existing codes.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";

interface CatalogRow {
  name: string;
  code: string;
  description?: string;
}

const SERVICE_STYLES: CatalogRow[] = [
  {
    name: "Full Service",
    code: "full-service",
    description:
      "Staffed onsite service. TPP: Buffet - Cook Onsite, Plated Dinner, Action Station, Family Style, Private Chef, Bar.",
  },
  {
    name: "Limited Service",
    code: "limited-service",
    description:
      "Delivered hot or ready-to-heat with limited staffing. TPP: Buffet - Bring Hot, Ready To Heat - CPU, Ready To Heat - Delivery.",
  },
  {
    name: "Drop Off",
    code: "drop-off",
    description:
      "Delivered, no service staff. TPP: Drop Off, Drop Off - Individual, Pickup.",
  },
  {
    name: "Vending",
    code: "vending",
    description:
      "Vending and food-truck service. TPP: Vending, Food Truck Window.",
  },
];

const OCCASIONS: CatalogRow[] = [
  { name: "Corporate Event", code: "corporate-event" },
  { name: "Wedding", code: "wedding" },
  { name: "Social Event", code: "social-event" },
  { name: "Vending", code: "vending" },
  { name: "Christmas Party", code: "christmas-party" },
  { name: "Birthday Party", code: "birthday-party" },
  { name: "Holiday", code: "holiday" },
  { name: "Rehearsal Dinner", code: "rehearsal-dinner" },
  { name: "Marketing Event", code: "marketing-event" },
  { name: "Fundraiser / Gala", code: "fundraiser-gala" },
  { name: "Funeral / Memorial / Celebration of Life", code: "memorial" },
  { name: "Aviation", code: "aviation" },
  { name: "Retreat", code: "retreat" },
  { name: "Graduation Party", code: "graduation-party" },
  { name: "Grand Opening", code: "grand-opening" },
  { name: "Private Chef", code: "private-chef" },
  { name: "Anniversary", code: "anniversary" },
  { name: "Open House", code: "open-house" },
  { name: "Bridal Shower", code: "bridal-shower" },
  { name: "Baby Shower", code: "baby-shower" },
  { name: "Retirement", code: "retirement" },
  { name: "Client Tasting", code: "client-tasting" },
  { name: "Other", code: "other" },
];

const REFERRAL_SOURCES: CatalogRow[] = [
  { name: "EZ Cater", code: "ez-cater" },
  { name: "Repeat Customer", code: "repeat-customer" },
  { name: "Referral", code: "referral" },
  { name: "Google", code: "google" },
  { name: "Salesperson", code: "salesperson" },
  { name: "Greater Spokane Food Truck Association", code: "gsfta" },
  { name: "Venue", code: "venue" },
  { name: "Event Planner", code: "event-planner" },
  { name: "The Knot", code: "the-knot" },
  { name: "Mangia Web", code: "mangia-web" },
  { name: "Spokane Eats", code: "spokane-eats" },
  { name: "Stancraft", code: "stancraft" },
  { name: "Wedding Planner", code: "wedding-planner" },
  { name: "Itex", code: "itex" },
  { name: "Wedding Wire", code: "wedding-wire" },
  { name: "Another Caterer", code: "another-caterer" },
  { name: "Instagram", code: "instagram" },
  { name: "Facebook", code: "facebook" },
  { name: "CDA Press", code: "cda-press" },
  { name: "Air Culinaire", code: "air-culinaire" },
  { name: "Templins", code: "templins" },
  { name: "Bridal Fair", code: "bridal-fair" },
  { name: "Other", code: "other" },
];

interface SeedTarget {
  label: string;
  rows: CatalogRow[];
  list: typeof api.queries.listOccasion;
  create: typeof api.mutations.Occasion_createViaRegister;
}

const TARGETS: SeedTarget[] = [
  {
    label: "service-style",
    rows: SERVICE_STYLES,
    list: api.queries.listServiceStyle,
    create: api.mutations.ServiceStyle_createViaRegister,
  },
  {
    label: "occasion",
    rows: OCCASIONS,
    list: api.queries.listOccasion,
    create: api.mutations.Occasion_createViaRegister,
  },
  {
    label: "referral-source",
    rows: REFERRAL_SOURCES,
    list: api.queries.listReferralSource,
    create: api.mutations.ReferralSource_createViaRegister,
  },
];

async function main(): Promise<void> {
  const auth = new CapsuleAgentAuthManager();
  const client = new ConvexHttpClient(auth.resolveConvexUrl());
  console.log(`Seeding catalogs → ${auth.resolveConvexUrl()}`);

  for (const target of TARGETS) {
    client.setAuth(await auth.resolveJwt());
    const existing = (await client.query(target.list, {})) as Array<{
      code?: string;
    }>;
    const have = new Set(existing.map((row) => row.code));
    let created = 0;
    for (const [index, row] of target.rows.entries()) {
      if (have.has(row.code)) continue;
      client.setAuth(await auth.resolveJwt());
      // No idempotencyKey: commandIdempotencyKeys is globally keyed (no tenant
      // column), so a shared key would replay tenant A's cached result for
      // tenant B. The list-first skip above is the tenant-scoped idempotency;
      // the per-tenant code-unique constraint is the backstop.
      await client.mutation(target.create, {
        name: row.name,
        code: row.code,
        sortOrder: index,
        description: row.description,
      });
      created += 1;
      console.log(`  + ${target.label}: ${row.name}`);
    }
    console.log(
      `${target.label}: ${created} created, ${target.rows.length - created} already present`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed-catalogs] ${message}`);
  process.exit(1);
});
