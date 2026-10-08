// The company's clients without their locked fields. The generated
// listClient opens ten locked fields per client; with 3,900 clients that ran
// past the server's time limit and failed every page that only needed client
// names. Pages that show one client's email, phone or address read that client
// on its own (getClient).
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
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

export const list = query({
  args: {},
  handler: async (ctx): Promise<DirectoryClient[]> => {
    const auth = await getAuthContext(ctx);
    // The same rule as listClient: sales or finance.
    if (!auth.tenantId || !canRead(auth, ["salesAccess", "financeAccess"]))
      return [];
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_tenantId", (q) =>
        q.eq("tenantId", auth.tenantId as string),
      )
      .collect();
    return rows
      .filter((row) => row.deletedAt == null)
      .map((row) => {
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
      });
  },
});
