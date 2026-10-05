// PL-SOURCE-DATASETS: TPP's event list report names each event's client by
// name only ("Contact Company Name", "Contact First Name", "Contact Last
// Name"), never by id. The event import finds that client among the company's
// clients (normally brought in from the TPP contact list first). One exact
// match links the event; none or several leave the event waiting on the
// import with a plain note, never guessing between two clients.

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { ImportedClientName } from "./tppParser";

/** Case, spacing and punctuation do not matter: "Post Falls  Dental." = "post falls dental". */
export const plainName = (text: string | null | undefined) =>
  (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type ClientName = {
  id: string;
  clientType: string;
  companyName: string;
  givenName: string;
  familyName: string;
};

/** One page of the company's clients by name (merged-away clients left out). */
export const clientNamesPage = internalQuery({
  args: { tenantId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("clients")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .paginate({ numItems: 2000, cursor: args.cursor });
    return {
      names: page.page
        .filter((c) => c.deletedAt == null && !c.mergedIntoClientId)
        .map((c): ClientName => ({
          id: c._id,
          clientType: c.clientType,
          companyName: plainName(c.companyName),
          givenName: plainName(c.givenName),
          familyName: plainName(c.familyName),
        })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export type ClientNameMatch =
  | { status: "found"; clientId: string }
  | { status: "none" }
  | { status: "several"; count: number };

function oneOf(matches: ClientName[]): ClientNameMatch | null {
  if (matches.length === 1)
    return { status: "found", clientId: matches[0]!.id };
  if (matches.length > 1) return { status: "several", count: matches.length };
  return null;
}

export function matchClientByName(
  clients: readonly ClientName[],
  name: ImportedClientName,
): ClientNameMatch {
  const company = plainName(name.companyName);
  const given = plainName(name.givenName);
  const family = plainName(name.familyName);

  if (given) {
    const people = clients.filter(
      (c) => c.givenName === given && c.familyName === family,
    );
    // Two people with one name: the one at the printed company.
    const atCompany = company
      ? people.filter((c) => c.companyName === company)
      : [];
    const match = oneOf(atCompany) ?? oneOf(people);
    if (match) return match;
  }

  // A company row; TPP also prints some companies split over the first and
  // last name ("Premera" / "Blue Cross").
  for (const wanted of [company, [given, family].filter(Boolean).join(" ")]) {
    if (!wanted) continue;
    const match = oneOf(
      clients.filter(
        (c) =>
          c.companyName === wanted &&
          (c.clientType === "company" || (!c.givenName && !c.familyName)),
      ),
    );
    if (match) return match;
  }
  return { status: "none" };
}
