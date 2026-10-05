import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { TppReportResult } from "../../src/features/reports/tpp/types";
import { getAuthContext } from "../lib/authContext";
import { decrypt } from "../lib/encryption";

export const REPORT_ROW_LIMIT = 2_000;
export const OPTION_ROW_LIMIT = 500;

// Record lists a report run stopped reading at REPORT_ROW_LIMIT, keyed by the
// run's own ctx so concurrent runs never share them.
const cutSources = new WeakMap<object, Set<string>>();

/** Reads are taken with one extra row; more than the limit means a cut. */
export function keepReportRows(ctx: object, source: string) {
  return <T>(rows: T[]): T[] => {
    if (rows.length <= REPORT_ROW_LIMIT) return rows;
    const sources = cutSources.get(ctx) ?? new Set<string>();
    sources.add(source);
    cutSources.set(ctx, sources);
    return rows.slice(0, REPORT_ROW_LIMIT);
  };
}

export function readLimitNotice(source: string): string {
  return `Only the first ${REPORT_ROW_LIMIT.toLocaleString("en-US")} ${source} were read, so rows may be missing. Pick a shorter date range or fewer choices to see them all.`;
}

export type ReportArgs = { reportId: string; parameters: unknown };

/** Runs a report and names every record list it had to stop reading. */
export function reportHandler(
  run: (ctx: QueryCtx, args: ReportArgs) => Promise<TppReportResult>,
) {
  return async (ctx: QueryCtx, args: ReportArgs): Promise<TppReportResult> => {
    const result = await run(ctx, args);
    const sources = cutSources.get(ctx);
    if (!sources?.size) return result;
    return {
      ...result,
      notices: [
        ...(result.notices ?? []),
        ...[...sources].map(readLimitNotice),
      ],
    };
  };
}

export async function requireReportTenant(ctx: QueryCtx): Promise<string> {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || auth.role === "anonymous") {
    throw new Error("Sign in to run reports");
  }
  return auth.tenantId;
}

export function isLiveTenantRow(
  row: { tenantId: string; deletedAt?: number | null },
  tenantId: string,
): boolean {
  return row.tenantId === tenantId && row.deletedAt == null;
}

export function inDateRange(
  value: number | null | undefined,
  start: number,
  end: number,
): boolean {
  return value != null && value >= start && value <= end;
}

/** Keep event snapshots; older imports may carry only the reusable venue link. */
export async function resolveReportEventVenue(
  ctx: QueryCtx,
  tenantId: string,
  event: Doc<"events">,
  includeAddress = true,
): Promise<Doc<"events">> {
  const hasName = Boolean(event.venueName?.trim());
  const hasAddress = Boolean(event.venueAddress?.trim());
  if ((hasName && (hasAddress || !includeAddress)) || !event.venueId)
    return event;
  const venueId = ctx.db.normalizeId("venues", event.venueId);
  const venue = venueId ? await ctx.db.get(venueId) : null;
  if (!venue || !isLiveTenantRow(venue, tenantId)) return event;
  if (!includeAddress)
    return { ...event, venueName: hasName ? event.venueName : venue.name };
  const plain = hasAddress
    ? venue
    : await decryptReportFields(
        ctx,
        "Venue",
        [
          "addressLine1",
          "addressLine2",
          "city",
          "region",
          "postalCode",
          "countryCode",
        ],
        venue,
      );
  return {
    ...event,
    venueName: hasName ? event.venueName : plain.name,
    venueAddress: hasAddress
      ? event.venueAddress
      : [
          plain.addressLine1,
          plain.addressLine2,
          plain.city,
          plain.region,
          plain.postalCode,
          plain.countryCode,
        ]
          .filter(Boolean)
          .join(", "),
  };
}

export async function decryptReportFields<T extends Record<string, unknown>>(
  ctx: unknown,
  entity: string,
  fields: readonly (keyof T & string)[],
  row: T,
): Promise<T> {
  const output = { ...row };
  for (const field of fields) {
    const raw = output[field];
    if (typeof raw !== "string") continue;
    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!envelope || typeof envelope !== "object") continue;
    const value = envelope as { v?: unknown; kid?: unknown; ct?: unknown };
    if (
      value.v !== 1 ||
      typeof value.kid !== "string" ||
      typeof value.ct !== "string"
    )
      continue;
    output[field] = (await decrypt(value.ct, value.kid, {
      ctx,
      entity,
      property: field,
    })) as T[keyof T & string];
  }
  return output;
}
