// The company's clients without their locked fields. The generated
// listClient opens ten locked fields per client; with 3,900 clients that ran
// past the server's time limit and failed every page that only needed client
// names. Pages that show one client's email, phone or address read that client
// on its own (getClient).
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import { canRead } from "./search";

const LOCKED = [
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
  "birthday",
  "taxId",
] as const;

export type DirectoryClient = Omit<Doc<"clients">, (typeof LOCKED)[number]> & {
  displayName: string;
  isArchived: boolean;
};

export type ContactClient = DirectoryClient & {
  email?: string;
  phone?: string;
};

async function liveClients(ctx: QueryCtx): Promise<Doc<"clients">[]> {
  const auth = await getAuthContext(ctx);
  // The same rule as listClient: sales or finance.
  if (!auth.tenantId || !canRead(auth, ["salesAccess", "financeAccess"]))
    return [];
  const rows = await ctx.db
    .query("clients")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId as string))
    .collect();
  return rows.filter((row) => row.deletedAt == null);
}

function withoutLocked(row: Doc<"clients">): DirectoryClient {
  const out: Record<string, unknown> = { ...row };
  for (const field of LOCKED) delete out[field];
  return {
    ...(out as Omit<Doc<"clients">, (typeof LOCKED)[number]>),
    displayName:
      row.clientType === "company"
        ? String(row.companyName ?? "")
        : `${row.givenName ?? ""} ${row.familyName ?? ""}`,
    isArchived: row.status === "archived",
  };
}

// Opens one locked field the same way the generated reads do; a value that
// was never locked comes back as it is.
async function openField(
  ctx: QueryCtx,
  property: "email" | "phone",
  raw: unknown,
): Promise<string | undefined> {
  if (typeof raw !== "string") return undefined;
  let envelope: { v?: unknown; kid?: unknown; ct?: unknown } | null;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !("v" in envelope && "kid" in envelope && "ct" in envelope)
  )
    return raw;
  if (envelope.v !== 1)
    throw new Error(
      `Unsupported Manifest encryption envelope version: ${String(envelope.v)}`,
    );
  return decrypt(String(envelope.ct), String(envelope.kid), {
    ctx,
    entity: "Client",
    property,
  });
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<DirectoryClient[]> =>
    (await liveClients(ctx)).map(withoutLocked),
});

// Names plus email and phone only: for pages that search or show how to reach
// every client (client list, new event, event import). Opens two of the ten
// locked fields, not all ten.
export const listWithContacts = query({
  args: {},
  handler: async (ctx): Promise<ContactClient[]> =>
    Promise.all(
      (await liveClients(ctx)).map(async (row) => ({
        ...withoutLocked(row),
        email: await openField(ctx, "email", row.email),
        phone: await openField(ctx, "phone", row.phone),
      })),
    ),
});
