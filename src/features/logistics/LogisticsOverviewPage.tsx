import { Link } from "react-router-dom";
import {
  useListDelivery,
  useListEvent,
  useListPackList,
  useListVehicle,
} from "../../lib/manifest-convex-react";
import { formatDate, formatTime } from "../../lib/format";
import {
  EmptyState,
  PageHeader,
  Section,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { LOGISTICS_SECTIONS } from "./logisticsRoutes";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";

const SECTION_DESCRIPTIONS: Record<string, string> = {
  packs: "Open pack lists per event and walk them to dispatched.",
  "pack-templates": "Reusable load-sheet templates for recurring event shapes.",
  deliveries: "Schedule runs from packed lists, assign drivers, track transit.",
  schedule: "See which vehicle is committed where, and when.",
  route: "Order the day's stops into a drivable route.",
  fleet: "Vehicle roster, capacity, and operational status.",
  maintenance: "Log service work and keep vehicles road-ready.",
};

type AttentionRow = {
  key: string;
  title: string;
  detail: string;
  reason: string;
  tone: "warn" | "danger";
  status: string;
  to: string;
};

export function LogisticsOverviewPage() {
  const deliveries = useListDelivery();
  const packLists = useListPackList();
  const vehicles = useListVehicle();
  const events = useListEvent();

  const loading =
    deliveries === undefined ||
    packLists === undefined ||
    vehicles === undefined ||
    events === undefined;

  const now = Date.now();
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const dayEnd = dayStart + 86_400_000;

  const liveDeliveries = (deliveries ?? []).filter(
    (row) => row.deletedAt == null && String(row.status) !== "cancelled",
  );
  const livePackLists = (packLists ?? []).filter(
    (row) => row.deletedAt == null && String(row.status) !== "cancelled",
  );
  const eventName = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Unknown event";

  const todayCount = liveDeliveries.filter(
    (row) =>
      row.windowStartsAt != null &&
      row.windowStartsAt >= dayStart &&
      row.windowStartsAt < dayEnd,
  ).length;
  const inTransitCount = liveDeliveries.filter(
    (row) => String(row.status) === "in_transit",
  ).length;
  const openPackCount = livePackLists.filter(
    (row) => String(row.status) !== "dispatched",
  ).length;
  const availableVehicleCount = (vehicles ?? []).filter(
    (row) =>
      row.deletedAt == null && String(row.operationalStatus) === "available",
  ).length;

  const attention: AttentionRow[] = [];
  for (const row of liveDeliveries) {
    if (String(row.status) === "scheduled" && row.driverId == null) {
      attention.push({
        key: `driver-${row._id}`,
        title: row.destination,
        detail: eventName(row.eventId),
        reason: `No driver assigned · window ${formatDate(row.windowStartsAt)} ${formatTime(row.windowStartsAt)}`,
        tone: "warn",
        status: String(row.status),
        to: "/logistics/deliveries",
      });
    }
    if (
      String(row.status) === "in_transit" &&
      row.windowEndsAt != null &&
      row.windowEndsAt < now
    ) {
      attention.push({
        key: `late-${row._id}`,
        title: row.destination,
        detail: eventName(row.eventId),
        reason: `Past delivery window (${formatDate(row.windowEndsAt)} ${formatTime(row.windowEndsAt)})`,
        tone: "danger",
        status: String(row.status),
        to: "/logistics/deliveries",
      });
    }
  }
  for (const row of livePackLists) {
    const ready = ["packed", "loaded"].includes(String(row.status));
    const hasDelivery = liveDeliveries.some(
      (delivery) => delivery.packListId === row._id,
    );
    if (ready && !hasDelivery) {
      attention.push({
        key: `pack-${row._id}`,
        title: row.name,
        detail: eventName(row.eventId),
        reason: `Ready since ${formatDate(row.packedAt ?? row.loadedAt)} — no delivery scheduled`,
        tone: "warn",
        status: String(row.status),
        to: `/logistics/packs/${row._id}`,
      });
    }
  }
  const attentionRows = attention
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1))
    .slice(0, 8);

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Logistics"
        lead="What's moving today, what's ready to roll, and what's stuck."
      />
      <LogisticsWorkspaceNav />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line lg:grid-cols-4">
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Deliveries today</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? "—" : todayCount}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">In transit</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? "—" : inTransitCount}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Open pack lists</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? "—" : openPackCount}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Vehicles available</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? "—" : availableVehicleCount}
          </dd>
        </div>
      </dl>

      <Section title="Needs attention" count={attentionRows.length}>
        {loading ? (
          <TableSkeleton rows={4} columns={3} />
        ) : attentionRows.length === 0 ? (
          <EmptyState
            title="Nothing is stuck."
            hint="Every scheduled delivery has a driver and every packed list has a run."
            action={
              <Link className="btn btn-ghost btn-sm" to="/logistics/deliveries">
                Open deliveries
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {attentionRows.map((row) => (
              <li key={row.key}>
                <Link
                  to={row.to}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 hover:bg-inset"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {row.title}
                    </span>
                    <span className="block text-[12px] text-ink-3">
                      {row.detail}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-[12px] ${row.tone === "danger" ? "text-danger" : "text-warn"}`}
                    >
                      {row.reason}
                    </span>
                    <StatusChip status={row.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Workspace" count={LOGISTICS_SECTIONS.length}>
        <ul className="divide-y divide-line">
          {LOGISTICS_SECTIONS.map((section) => (
            <li key={section.key}>
              <Link
                to={section.path}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5 hover:bg-inset"
              >
                <span className="w-36 shrink-0 font-medium text-ink">
                  {section.label}
                </span>
                <span className="text-[12px] text-ink-2">
                  {SECTION_DESCRIPTIONS[section.key]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
