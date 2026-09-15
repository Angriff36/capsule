/**
 * One-shot idempotent seed for the operational catalogs (issues #113/#119):
 * Occasion, ServiceStyle, ReferralSource. Values come from the TPP master
 * export (work/tpp-raw-master-2021-2026.csv value tallies) plus Josh's four
 * canonical service styles.
 *
 *   bun run agent:mint-jwt        # sign into Capsule UI first (target org selected)
 *   bun run seed                  # generated demo rows; JWT attached via bunfig preload
 *   bun scripts/seed-catalogs.ts  # Occasion / ServiceStyle / ReferralSource catalogs
 *
 * Targets CONVEX_URL || VITE_CONVEX_URL, authed via CAPSULE_AGENT_JWT
 * (reminted automatically when expired). Re-running skips existing codes.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";

import {
  OCCASION_CATALOG,
  REFERRAL_SOURCE_CATALOG,
  type StandardCatalogRow,
} from "../src/features/admin/catalogStandardOptions";
import { SERVICE_STYLE_CATALOG } from "../src/features/events/serviceStyleCatalog";

// The same lists the Admin → Catalogs "Add the standard list" button uses.
const SERVICE_STYLES: StandardCatalogRow[] = [...SERVICE_STYLE_CATALOG];
const OCCASIONS: StandardCatalogRow[] = [...OCCASION_CATALOG];
const REFERRAL_SOURCES: StandardCatalogRow[] = [...REFERRAL_SOURCE_CATALOG];

interface SeedTarget {
  label: string;
  rows: StandardCatalogRow[];
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
