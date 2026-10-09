// The company's clients without their locked fields. The generated
// listClient opens ten locked fields per client; with 3,900 clients that ran
// past the server's time limit and failed every page that only needed client
// names. Pages that show one client's email, phone or address read that client
// on its own (getClient).
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
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

// At most this many clients by id in one read (a page names its own rows).
const BY_IDS_CAP = 500;
const SEARCH_LIMIT = 25;

async function readerTenant(ctx: QueryCtx): Promise<string | null> {
  const auth = await getAuthContext(ctx);
  return auth.tenantId && canRead(auth, ["salesAccess", "financeAccess"])
    ? auth.tenantId
    : null;
}

/** These clients only (names, no locked fields): what a page names. */
export const byIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }): Promise<DirectoryClient[]> => {
    const tenantId = await readerTenant(ctx);
    if (!tenantId) return [];
    const out: DirectoryClient[] = [];
    for (const raw of [...new Set(ids)].slice(0, BY_IDS_CAP)) {
      const id = ctx.db.normalizeId("clients", raw);
      const row = id ? await ctx.db.get(id) : null;
      if (row && row.tenantId === tenantId && row.deletedAt == null)
        out.push(withoutLocked(row));
    }
    return out;
  },
});

/**
 * Clients whose company, first or last name matches the typed text, at most
 * 25; with no text, the newest clients. A picker searches; it never loads
 * every client.
 */
export const search = query({
  args: { text: v.string(), withContacts: v.optional(v.boolean()) },
  handler: async (
    ctx,
    { text, withContacts },
  ): Promise<DirectoryClient[] | ContactClient[]> => {
    const tenantId = await readerTenant(ctx);
    if (!tenantId) return [];
    const typed = text.trim();
    const rows = new Map<string, Doc<"clients">>();
    if (!typed) {
      for (const row of await ctx.db
        .query("clients")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .take(SEARCH_LIMIT * 2))
        if (row.deletedAt == null) rows.set(String(row._id), row);
    } else {
      for (const [index, field] of [
        ["search_companyName", "companyName"],
        ["search_givenName", "givenName"],
        ["search_familyName", "familyName"],
      ] as const)
        for (const row of await ctx.db
          .query("clients")
          .withSearchIndex(index, (q) =>
            q.search(field, typed).eq("tenantId", tenantId),
          )
          .take(SEARCH_LIMIT))
          if (row.deletedAt == null) rows.set(String(row._id), row);
    }
    const picked = [...rows.values()].slice(0, SEARCH_LIMIT);
    return withContacts
      ? await Promise.all(picked.map((row) => withContactFields(ctx, row)))
      : picked.map(withoutLocked);
  },
});

async function withContactFields(
  ctx: QueryCtx,
  row: Doc<"clients">,
): Promise<ContactClient> {
  return {
    ...withoutLocked(row),
    email: await openField(ctx, "email", row.email),
    phone: await openField(ctx, "phone", row.phone),
  };
}

/**
 * The client book a page at a time, newest first, with email and phone
 * opened for the page's rows only (the client list).
 */
export const contactsPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const tenantId = await readerTenant(ctx);
    if (!tenantId)
      return { page: [] as ContactClient[], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("clients")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page
          .filter((row) => row.deletedAt == null)
          .map((row) => withContactFields(ctx, row)),
      ),
    };
  },
});
