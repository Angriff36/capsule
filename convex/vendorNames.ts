// The staffing agency box (Roster > Scheduling > Edit) offers the company's
// vendors. The generated vendor list follows vendorRead (procurement staff
// and event managers), so a workforce manager who edits the roster got an
// empty list. This read gives only the names of active vendors, to the
// vendor readers and to the people who keep the roster; no contact details,
// terms or notes.
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

const NAME_READERS = [
  "procurementAccess",
  "eventManageAccess",
  "workforceAccess",
  "manageAccess",
];

/** Names of the company's active vendors, sorted; [] for other roles. */
export const active = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, NAME_READERS)) return [];
    const tenantId = auth.tenantId;
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    return vendors
      .filter(
        (vendor) => vendor.deletedAt == null && vendor.status === "active",
      )
      .map((vendor) => vendor.name)
      .sort((a, b) => a.localeCompare(b));
  },
});
