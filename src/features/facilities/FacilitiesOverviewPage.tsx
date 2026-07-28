import { Link } from "react-router-dom";
import {
  useListEquipment,
  useListEquipmentMaintenanceTask,
  useListVenue,
  useListVenueLayoutTemplate,
} from "../../lib/manifest-convex-react";
import { formatDate, relativeDays } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  EmptyState,
  PageHeader,
  Section,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { FACILITIES_SECTIONS } from "./facilitiesRoutes";

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_MS = 7 * DAY_MS;
const ATTENTION_LIMIT = 8;

const SECTION_HINTS: Record<string, string> = {
  equipment: "Asset catalog, conditions, and the maintenance log.",
  venues: "Every venue with capacity, logistics, and contacts.",
  "layout-templates": "Reusable room layouts for recurring venues.",
  "vendor-relationships": "Preferred and required vendors per venue.",
};

type AttentionRow = {
  key: string;
  title: string;
  detail: string;
  chipStatus: string;
  chipLabel?: string;
  to: string;
};

export function FacilitiesOverviewPage() {
  const venues = useListVenue();
  const equipment = useListEquipment();
  const maintenanceTasks = useListEquipmentMaintenanceTask();
  const layoutTemplates = useListVenueLayoutTemplate();

  const isLoading =
    venues === undefined ||
    equipment === undefined ||
    maintenanceTasks === undefined ||
    layoutTemplates === undefined;

  const now = Date.now();

  const liveVenues = (venues ?? []).filter((row) => row.deletedAt == null);
  const activeVenues = liveVenues.filter((row) => row.status === "active");
  const onPremiseVenues = activeVenues.filter((row) => row.onPremise === true);

  const liveEquipment = (equipment ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const equipmentById = new Map(
    liveEquipment.map((row) => [String(row._id), row]),
  );
  const ailingEquipment = liveEquipment.filter(
    (row) => row.condition === "poor" || row.condition === "out_of_service",
  );

  const liveTasks = (maintenanceTasks ?? []).filter(
    (row) => row.deletedAt == null && row.scheduledAt != null,
  );
  const dueTasks = liveTasks
    .filter((row) => row.nextDueAt != null && row.nextDueAt <= now + SOON_MS)
    .sort((left, right) => Number(left.nextDueAt) - Number(right.nextDueAt));

  const activeTemplates = (layoutTemplates ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );

  const attentionRows: AttentionRow[] = [
    ...dueTasks.map((task) => {
      const dueAt = Number(task.nextDueAt);
      const overdue = dueAt < now;
      const asset = equipmentById.get(String(task.equipmentId));
      return {
        key: `task-${String(task._id)}`,
        title: String(task.taskName),
        detail: `${asset?.name ?? "Equipment"} · due ${formatDate(dueAt)} (${relativeDays(dueAt, now)})`,
        chipStatus: overdue ? "overdue" : "pending",
        chipLabel: overdue ? "Overdue" : "Due soon",
        to: "/facilities/equipment",
      };
    }),
    ...ailingEquipment.map((row) => ({
      key: `equipment-${String(row._id)}`,
      title: String(row.name),
      detail: `Asset ${String(row.assetTag)} · condition needs review`,
      chipStatus: String(row.condition),
      to: "/facilities/equipment",
    })),
  ].slice(0, ATTENTION_LIMIT);

  const kpis = [
    { label: "Active venues", value: activeVenues.length },
    { label: "On-premise venues", value: onPremiseVenues.length },
    { label: "Maintenance due", value: dueTasks.length },
    { label: "Layout templates", value: activeTemplates.length },
  ];

  const sectionCounts: Record<string, number> = {
    equipment: liveEquipment.length,
    venues: activeVenues.length,
    "layout-templates": activeTemplates.length,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Facilities"
        lead="Venues, equipment, and the service work that keeps them event-ready."
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-panel px-4 py-3">
            <dt className="eyebrow">{kpi.label}</dt>
            <dd className="mt-1 text-xl font-semibold text-ink">
              {isLoading ? "—" : kpi.value}
            </dd>
          </div>
        ))}
      </dl>

      <Section
        title="Needs attention"
        count={isLoading ? undefined : attentionRows.length}
      >
        {isLoading ? (
          <TableSkeleton rows={4} columns={2} />
        ) : attentionRows.length === 0 ? (
          <EmptyState
            title="Nothing needs attention"
            hint="No maintenance is due in the next 7 days and no equipment is flagged."
            action={
              <Link className="btn btn-ghost btn-sm" to="/facilities/equipment">
                Open maintenance log
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {attentionRows.map((row) => (
              <li key={row.key}>
                <Link
                  to={row.to}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-inset"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {row.title}
                    </span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {row.detail}
                    </span>
                  </span>
                  <StatusChip
                    status={row.chipStatus}
                    label={row.chipLabel ?? formatStatusLabel(row.chipStatus)}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Workspaces" count={FACILITIES_SECTIONS.length}>
        <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
          {FACILITIES_SECTIONS.map((section) => (
            <Link
              key={section.key}
              to={section.path}
              className="block bg-panel px-4 py-3 hover:bg-inset"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-ink">{section.label}</span>
                {!isLoading && sectionCounts[section.key] != null ? (
                  <span className="font-mono text-[12px] text-ink-3">
                    {sectionCounts[section.key]}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[12px] text-ink-3">
                {SECTION_HINTS[section.key]}
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
