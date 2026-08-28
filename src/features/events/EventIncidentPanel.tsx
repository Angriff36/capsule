import { useMemo, useState, type FormEvent } from "react";
import { type Doc, type Id } from "../../lib/api";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  useCorrectiveActionClose,
  useCreateCorrectiveAction,
  useCreateIncident,
  useIncidentBeginInvestigation,
  useIncidentDismiss,
  useIncidentMarkResolved,
  useListCorrectiveAction,
  useListIncident,
} from "../../lib/manifest-convex-react";
import { EmptyState, Skeleton } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import {
  EventIncidentCard,
  type IncidentActionKind,
} from "./EventIncidentCard";
import { EventIncidentSummaryAside } from "./EventIncidentSummaryAside";
import { FailureBanner } from "./FailureBanner";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const CATEGORIES = [
  "food_safety",
  "allergen",
  "injury",
  "equipment",
  "service",
  "other",
] as const;

const FILTERS = ["all", "open", "high"] as const;
type IncidentFilter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<IncidentFilter, string> = {
  all: "All",
  open: "Open",
  high: "High severity",
};

const label = (value: string) => formatStatusLabel(value);

type IncidentAction = {
  kind: IncidentActionKind;
  incidentId: Id<"incidents">;
} | null;

/**
 * Event incidents + allergen response workflow. Reporting an allergen
 * incident also opens the required corrective action here (the Manifest
 * compiler has no child-creating reactions); closing the corrective action
 * unlocks the incident server-side via the CorrectiveActionClosed reaction.
 */
export function EventIncidentPanel({ eventId }: { eventId: Id<"events"> }) {
  const allIncidents = useListIncident();
  const incidentRows = useMemo(
    () => allIncidents?.filter((r) => r.eventId === eventId),
    [allIncidents, eventId],
  );
  const allCorrective = useListCorrectiveAction();
  const correctiveRows = useMemo(
    () => allCorrective?.filter((r) => r.eventId === eventId),
    [allCorrective, eventId],
  );
  const report = useCreateIncident();
  const beginInvestigation = useIncidentBeginInvestigation();
  const markResolved = useIncidentMarkResolved();
  const dismiss = useIncidentDismiss();
  const openCorrective = useCreateCorrectiveAction();
  const closeCorrective = useCorrectiveActionClose();

  const [showReport, setShowReport] = useState(false);
  const [filter, setFilter] = useState<IncidentFilter>("all");
  const [action, setAction] = useState<IncidentAction>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const incidents = useMemo(
    () =>
      (incidentRows ?? [])
        .filter((row) => row.reportedAt != null && row.deletedAt == null)
        .sort(
          (left, right) => (right.reportedAt ?? 0) - (left.reportedAt ?? 0),
        ),
    [incidentRows],
  );

  const correctiveByIncident = useMemo(() => {
    const map = new Map<string, Doc<"correctiveActions">>();
    for (const row of correctiveRows ?? []) {
      if (row.deletedAt != null) continue;
      const existing = map.get(row.incidentId as string);
      if (!existing || row.status === "open") {
        map.set(row.incidentId as string, row);
      }
    }
    return map;
  }, [correctiveRows]);

  const visible = incidents.filter((incident) => {
    if (filter === "open") {
      return incident.status === "open" || incident.status === "investigating";
    }
    if (filter === "high") {
      return incident.severity === "high" || incident.severity === "critical";
    }
    return true;
  });
  const resolvedCount = incidents.filter(
    (row) => row.status === "resolved",
  ).length;
  const openCorrectiveCount = incidents.filter(
    (row) => row.correctiveActionRequired === true,
  ).length;

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
      setAction(null);
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const submitReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const severity = String(data.get("severity") ?? "medium");
    const category = String(data.get("category") ?? "other");
    const description = String(data.get("description") ?? "").trim();
    void run("report", async () => {
      const created = (await report({
        eventId,
        severity,
        category,
        description,
      })) as { docId: Id<"incidents"> };
      if (category === "allergen") {
        await openCorrective({
          incidentId: created.docId,
          eventId,
          description: `Corrective action for allergen incident: ${description}`,
        });
      }
      form.reset();
      setShowReport(false);
    });
  };

  const submitAction = (
    incident: Doc<"incidents">,
    corrective: Doc<"correctiveActions"> | undefined,
    kind: IncidentActionKind,
    value: string,
  ) => {
    const version =
      typeof incident.version === "number" ? incident.version : undefined;
    if (kind === "resolve") {
      void run(`resolve-${incident._id}`, () =>
        markResolved({ docId: incident._id, resolution: value, version }),
      );
    }
    if (kind === "dismiss") {
      void run(`dismiss-${incident._id}`, () =>
        dismiss({ docId: incident._id, reason: value, version }),
      );
    }
    if (kind === "closeCorrective" && corrective) {
      void run(`close-corrective-${incident._id}`, () =>
        closeCorrective({
          docId: corrective._id,
          resolutionNotes: value,
          version:
            typeof corrective.version === "number"
              ? corrective.version
              : undefined,
        }),
      );
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="card px-4 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl leading-none text-ink">
                Incident log
              </h2>
              <p className="mt-1.5 text-base text-ink-2">
                {incidents.length} incident
                {incidents.length === 1 ? "" : "s"} ({resolvedCount} resolved)
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowReport((value) => !value)}
            >
              {showReport ? "Dismiss" : "Report incident"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-2.5">
            <span className="mr-1.5 text-sm font-bold tracking-[0.06em] text-ink-3 uppercase">
              Filter
            </span>
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                className={`rounded-full px-3 py-1 text-base transition-colors ${
                  filter === value
                    ? "bg-brand-soft font-semibold text-brand"
                    : "text-ink-3 hover:text-ink"
                }`}
                onClick={() => setFilter(value)}
              >
                {FILTER_LABEL[value]}
              </button>
            ))}
          </div>
          {showReport ? (
            <form
              onSubmit={submitReport}
              className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <label className="field-label">
                Severity
                <select name="severity" className="input" defaultValue="medium">
                  {SEVERITIES.map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Category
                <select name="category" className="input" defaultValue="other">
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label sm:col-span-2">
                Description
                <input
                  name="description"
                  className="input"
                  required
                  autoFocus
                />
              </label>
              <p className="text-xs text-ink-3 sm:col-span-3">
                Allergen incidents notify the coordination team, open a required
                corrective action, and stay locked until it is closed.
              </p>
              <button
                className="btn btn-primary self-end"
                disabled={busy === "report"}
              >
                {busy === "report" ? "Reporting…" : "Report incident"}
              </button>
            </form>
          ) : null}
        </section>

        {failure ? <FailureBanner failure={failure} /> : null}

        {incidentRows === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No incidents reported"
              hint="Quality and safety incidents for this event will appear here."
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="card">
            <EmptyState
              title="Nothing matches this filter"
              hint="Switch back to All to see every incident on this event."
            />
          </div>
        ) : (
          visible.map((incident) => {
            const corrective = correctiveByIncident.get(incident._id);
            return (
              <EventIncidentCard
                key={incident._id}
                incident={incident}
                corrective={corrective}
                busy={busy?.endsWith(incident._id) ?? false}
                activeAction={
                  action?.incidentId === incident._id ? action.kind : null
                }
                onInvestigate={() =>
                  void run(`investigate-${incident._id}`, () =>
                    beginInvestigation({
                      docId: incident._id,
                      version:
                        typeof incident.version === "number"
                          ? incident.version
                          : undefined,
                    }),
                  )
                }
                onSelectAction={(kind) =>
                  setAction(
                    kind == null ? null : { kind, incidentId: incident._id },
                  )
                }
                onSubmitAction={(kind, value) =>
                  submitAction(incident, corrective, kind, value)
                }
              />
            );
          })
        )}
      </div>

      <EventIncidentSummaryAside
        incidents={incidents}
        openCorrectiveCount={openCorrectiveCount}
      />
    </div>
  );
}
