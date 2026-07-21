/** Builds Home attention + upcoming services from queryable facts only. */

export type HomeAttentionLaneId =
  | "open_invoices"
  | "open_prep"
  | "open_packs"
  | "draft_closeouts"
  | "services_this_week";

export interface HomeAttentionItem {
  id: HomeAttentionLaneId;
  label: string;
  count: number;
  href: string;
  detail: string;
}

export interface HomeUpcomingService {
  id: string;
  title: string;
  stage: string;
  startsAt: number | null;
  href: string;
  readiness: string[];
}

export interface HomeServiceDeskSnapshot {
  role: string;
  attention: HomeAttentionItem[];
  upcoming: HomeUpcomingService[];
}

type SoftDeletable = { deletedAt?: number | null };

type EventRow = SoftDeletable & {
  _id: string;
  title?: string | null;
  stage?: string | null;
  startsAt?: number | null;
};

type InvoiceRow = SoftDeletable & { status?: string | null };
type PrepRow = SoftDeletable & { status?: string | null };
type PackRow = SoftDeletable & {
  status?: string | null;
  eventId?: string | null;
};
type CloseoutRow = SoftDeletable & { status?: string | null };

export interface HomeServiceDeskFacts {
  role: string;
  nowMs?: number;
  events: readonly EventRow[] | undefined;
  invoices: readonly InvoiceRow[] | undefined;
  prepTasks: readonly PrepRow[] | undefined;
  packLists: readonly PackRow[] | undefined;
  closeouts: readonly CloseoutRow[] | undefined;
}

const TERMINAL_EVENT_STAGES = new Set(["cancelled", "closed_out"]);
const OPEN_INVOICE_STATUSES = new Set([
  "draft",
  "sent",
  "viewed",
  "overdue",
  "partial",
]);
const OPEN_PREP_STATUSES = new Set([
  "open",
  "claimed",
  "in_progress",
  "blocked",
]);
const OPEN_PACK_STATUSES = new Set(["draft", "packing", "packed", "loaded"]);
const WEEK_MS = 7 * 86_400_000;
const UPCOMING_LIMIT = 8;

const LANE_ORDER: HomeAttentionLaneId[] = [
  "services_this_week",
  "open_prep",
  "open_packs",
  "open_invoices",
  "draft_closeouts",
];

/** Role → preferred attention lanes (others still appear when count > 0). */
const ROLE_LANE_PRIORITY: Record<string, readonly HomeAttentionLaneId[]> = {
  kitchen_staff: ["open_prep", "services_this_week", "open_packs"],
  kitchen_lead: ["open_prep", "services_this_week", "open_packs"],
  kitchen_manager: ["open_prep", "services_this_week", "open_packs"],
  logistics_staff: ["open_packs", "services_this_week", "open_prep"],
  logistics_manager: ["open_packs", "services_this_week", "open_prep"],
  driver: ["open_packs", "services_this_week"],
  finance_staff: ["open_invoices", "draft_closeouts", "services_this_week"],
  finance_manager: ["open_invoices", "draft_closeouts", "services_this_week"],
  sales_staff: ["services_this_week", "open_invoices"],
  sales_manager: ["services_this_week", "open_invoices"],
  event_staff: ["services_this_week", "open_prep", "open_packs"],
  event_manager: [
    "services_this_week",
    "open_prep",
    "open_packs",
    "open_invoices",
  ],
  manager: LANE_ORDER,
  admin: LANE_ORDER,
  owner: LANE_ORDER,
  staff: ["services_this_week", "open_prep", "open_packs"],
};

function active<T extends SoftDeletable>(rows: readonly T[] | undefined): T[] {
  return (rows ?? []).filter((row) => row.deletedAt == null);
}

function laneRank(role: string, id: HomeAttentionLaneId): number {
  const preferred = ROLE_LANE_PRIORITY[role] ?? ROLE_LANE_PRIORITY.staff;
  const index = preferred.indexOf(id);
  if (index >= 0) return index;
  return 100 + LANE_ORDER.indexOf(id);
}

export class HomeAttentionPolicy {
  build(facts: HomeServiceDeskFacts): HomeServiceDeskSnapshot {
    const now = facts.nowMs ?? Date.now();
    const events = active(facts.events);
    const invoices = active(facts.invoices);
    const prepTasks = active(facts.prepTasks);
    const packLists = active(facts.packLists);
    const closeouts = active(facts.closeouts);

    const liveEvents = events.filter(
      (event) => !TERMINAL_EVENT_STAGES.has(String(event.stage)),
    );
    const servicesThisWeek = liveEvents.filter((event) => {
      const startsAt = event.startsAt;
      if (startsAt == null) return false;
      return startsAt >= now && startsAt <= now + WEEK_MS;
    });

    const openInvoices = invoices.filter((row) =>
      OPEN_INVOICE_STATUSES.has(String(row.status)),
    );
    const openPrep = prepTasks.filter((row) =>
      OPEN_PREP_STATUSES.has(String(row.status)),
    );
    const openPacks = packLists.filter((row) =>
      OPEN_PACK_STATUSES.has(String(row.status)),
    );
    const draftCloseouts = closeouts.filter(
      (row) => String(row.status) === "draft",
    );

    const candidates: HomeAttentionItem[] = [
      {
        id: "services_this_week",
        label: "Services this week",
        count: servicesThisWeek.length,
        href: "/events",
        detail: "Live bookings with a start in the next seven days.",
      },
      {
        id: "open_prep",
        label: "Open prep tasks",
        count: openPrep.length,
        href: "/kitchen/prep",
        detail: "Prep still open, claimed, in progress, or blocked.",
      },
      {
        id: "open_packs",
        label: "Open pack lists",
        count: openPacks.length,
        href: "/logistics/packs",
        detail: "Pack lists not yet dispatched or cancelled.",
      },
      {
        id: "open_invoices",
        label: "Open invoices",
        count: openInvoices.length,
        href: "/finance/invoices",
        detail: "Draft through partial invoices still collecting.",
      },
      {
        id: "draft_closeouts",
        label: "Draft closeouts",
        count: draftCloseouts.length,
        href: "/finance/closeout",
        detail: "Captured closeouts waiting to finalize.",
      },
    ];

    const attention = candidates
      .filter((item) => item.count > 0)
      .sort(
        (a, b) =>
          laneRank(facts.role, a.id) - laneRank(facts.role, b.id) ||
          b.count - a.count,
      );

    const openPackByEvent = new Map<string, number>();
    for (const pack of openPacks) {
      const eventId = String(pack.eventId ?? "");
      if (!eventId) continue;
      openPackByEvent.set(eventId, (openPackByEvent.get(eventId) ?? 0) + 1);
    }

    const upcoming = [...liveEvents]
      .filter((event) => event.startsAt == null || event.startsAt >= now)
      .sort(
        (a, b) =>
          (a.startsAt ?? Number.MAX_SAFE_INTEGER) -
          (b.startsAt ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, UPCOMING_LIMIT)
      .map((event) => {
        const readiness: string[] = [];
        const packs = openPackByEvent.get(event._id) ?? 0;
        if (packs > 0) {
          readiness.push(
            packs === 1 ? "1 open pack list" : `${packs} open pack lists`,
          );
        }
        const stage = String(event.stage ?? "planning");
        readiness.push(`Stage ${stage.replaceAll("_", " ")}`);
        return {
          id: event._id,
          title: String(event.title ?? "Untitled event"),
          stage,
          startsAt: event.startsAt ?? null,
          href: `/events/${event._id}`,
          readiness,
        };
      });

    return {
      role: facts.role,
      attention,
      upcoming,
    };
  }
}
