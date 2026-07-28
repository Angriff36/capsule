import { useMemo, useState, type FormEvent } from "react";
import { api, type Doc, type Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
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
import { EmptyState, Section, Skeleton, StatusChip } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
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

const label = (value: string) => formatStatusLabel(value);

type IncidentAction = {
  kind: "resolve" | "dismiss" | "closeCorrective";
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

  return (
    <Section
      title="Incidents"
      count={incidents.length}
      actions={
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowReport((value) => !value)}
        >
          {showReport ? "Dismiss" : "Report incident"}
        </button>
      }
    >
      <div className="space-y-3 p-3">
        {failure ? <FailureBanner failure={failure} /> : null}
        {showReport ? (
          <form
            onSubmit={submitReport}
            className="grid gap-2 rounded-xs border border-line bg-inset/40 p-3 sm:grid-cols-2 lg:grid-cols-4"
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
              <input name="description" className="input" required autoFocus />
            </label>
            <p className="text-[11.5px] text-ink-3 sm:col-span-3">
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

        {incidentRows === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : incidents.length === 0 ? (
          <EmptyState
            title="No incidents reported"
            hint="Quality and safety incidents for this event will appear here."
          />
        ) : (
          <div className="divide-y divide-line rounded-xs border border-line">
            {incidents.map((incident) => {
              const version =
                typeof incident.version === "number"
                  ? incident.version
                  : undefined;
              const isBusy = busy?.endsWith(incident._id) ?? false;
              const incidentAction =
                action?.incidentId === incident._id ? action : null;
              const corrective = correctiveByIncident.get(incident._id);
              const locked = incident.correctiveActionRequired === true;
              const openIncident =
                incident.status === "open" ||
                incident.status === "investigating";
              return (
                <article key={incident._id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">
                          {label(String(incident.category))}
                        </h3>
                        <StatusChip status={incident.status} />
                        <span className="chip">
                          {label(String(incident.severity))}
                        </span>
                        {locked ? (
                          <span className="chip border-warn/30 bg-warn-soft text-warn">
                            Locked — corrective action open
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-ink-2">
                        {incident.description}
                      </p>
                      <p className="mt-1 font-mono text-[10.5px] text-ink-3">
                        {formatDate(incident.reportedAt)}{" "}
                        {formatTime(incident.reportedAt)}
                      </p>
                      {incident.resolution ? (
                        <p className="mt-1 text-[11.5px] text-ink-2">
                          Resolution: {incident.resolution}
                        </p>
                      ) : null}
                      {incident.dismissalReason ? (
                        <p className="mt-1 text-[11.5px] text-ink-2">
                          Dismissed: {incident.dismissalReason}
                        </p>
                      ) : null}
                      {corrective ? (
                        <p className="mt-1 text-[11.5px] text-ink-2">
                          Corrective action ({label(String(corrective.status))}
                          ): {corrective.description}
                          {corrective.resolutionNotes
                            ? ` — ${corrective.resolutionNotes}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {incident.status === "open" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={isBusy}
                          onClick={() =>
                            void run(`investigate-${incident._id}`, () =>
                              beginInvestigation({
                                docId: incident._id,
                                version,
                              }),
                            )
                          }
                        >
                          Investigate
                        </button>
                      ) : null}
                      {corrective && corrective.status === "open" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={isBusy}
                          onClick={() =>
                            setAction({
                              kind: "closeCorrective",
                              incidentId: incident._id,
                            })
                          }
                        >
                          Close corrective action
                        </button>
                      ) : null}
                      {openIncident ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={isBusy || locked}
                          title={
                            locked
                              ? "Locked until the corrective action is closed"
                              : undefined
                          }
                          onClick={() =>
                            setAction({
                              kind: "resolve",
                              incidentId: incident._id,
                            })
                          }
                        >
                          Resolve
                        </button>
                      ) : null}
                      {openIncident ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={isBusy || locked}
                          title={
                            locked
                              ? "Locked until the corrective action is closed"
                              : undefined
                          }
                          onClick={() =>
                            setAction({
                              kind: "dismiss",
                              incidentId: incident._id,
                            })
                          }
                        >
                          Dismiss
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {incidentAction ? (
                    <form
                      className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const value = String(
                          new FormData(event.currentTarget).get("value") ?? "",
                        ).trim();
                        if (!value) return;
                        if (incidentAction.kind === "resolve")
                          void run(`resolve-${incident._id}`, () =>
                            markResolved({
                              docId: incident._id,
                              resolution: value,
                              version,
                            }),
                          );
                        if (incidentAction.kind === "dismiss")
                          void run(`dismiss-${incident._id}`, () =>
                            dismiss({
                              docId: incident._id,
                              reason: value,
                              version,
                            }),
                          );
                        if (
                          incidentAction.kind === "closeCorrective" &&
                          corrective
                        )
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
                      }}
                    >
                      <label className="field-label min-w-0 flex-1 basis-48">
                        {incidentAction.kind === "resolve"
                          ? "Resolution"
                          : incidentAction.kind === "dismiss"
                            ? "Dismissal reason"
                            : "Resolution notes"}
                        <input
                          name="value"
                          className="input"
                          required
                          autoFocus
                        />
                      </label>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={isBusy}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setAction(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}
