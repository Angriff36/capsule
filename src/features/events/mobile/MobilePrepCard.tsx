import { useState } from "react";
import {
  useListPrepTask,
  useListPrepTaskDependency,
  usePrepTaskClaim,
  usePrepTaskComplete,
  usePrepTaskStart,
} from "../../../lib/manifest-convex-react";
import { formatStatusLabel } from "../../../lib/statusLabels";
import { useAuthStatus } from "../../../lib/useAuthStatus";
import { prepQuantityLabel } from "../../kitchen/prepQuantityLabel";
import { prepTaskDependencySummary } from "../../production/PrepTaskDependencies";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { eventDetailPath } from "../eventRoutes";
import { FailureBanner } from "../FailureBanner";
import {
  MobileEmpty,
  MobileMore,
  MobileSectionCard,
} from "./MobileSectionCard";

const ROW_LIMIT = 10;
/** Working order first, finished last. */
const STATUS_ORDER = [
  "in_progress",
  "claimed",
  "pending",
  "blocked",
  "completed",
];

type PrepTask = NonNullable<ReturnType<typeof useListPrepTask>>[number];

function nextAction(
  status: string,
): { label: string; verb: "claim" | "start" | "complete" } | null {
  if (status === "pending") return { label: "Claim", verb: "claim" };
  if (status === "claimed") return { label: "Start", verb: "start" };
  if (status === "in_progress") return { label: "Complete", verb: "complete" };
  return null;
}

/** Prep tasks for this event with claim → start → complete on the phone. */
export function MobilePrepCard({ eventId }: { readonly eventId: string }) {
  const tasks = useListPrepTask();
  const dependencies = useListPrepTaskDependency();
  const authStatus = useAuthStatus();
  const claim = usePrepTaskClaim();
  const start = usePrepTaskStart();
  const complete = usePrepTaskComplete();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const rows = (tasks ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.eventId === eventId &&
        row.status !== "cancelled",
    )
    .sort((a, b) => {
      const rank = (row: PrepTask) => {
        const index = STATUS_ORDER.indexOf(String(row.status));
        return index === -1 ? STATUS_ORDER.length : index;
      };
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
  const done = rows.filter((row) => row.status === "completed").length;
  const shown = rows.slice(0, ROW_LIMIT);

  const run = async (task: PrepTask, verb: "claim" | "start" | "complete") => {
    setFailure(null);
    // PrepTask.claim writes user.personId into a Person FK; say so up front
    // instead of surfacing a bare "requirement not met" (same as the kitchen deck).
    if (verb === "claim" && !authStatus?.personId) {
      setFailure(
        classifyCommandFailure(
          new Error(
            "Your sign-in isn't linked to a staff profile yet, so it can't hold prep work. Ask an admin to link it under Administration → Team roles.",
          ),
        ),
      );
      return;
    }
    setBusy(task._id);
    try {
      const args = { docId: task._id, version: task.version };
      if (verb === "claim") await claim(args);
      else if (verb === "start") await start(args);
      else await complete(args);
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <MobileSectionCard
      id="prep"
      title="Prep"
      caption={rows.length > 0 ? `${done} of ${rows.length} done` : undefined}
      seeAllTo={eventDetailPath(eventId, "prep")}
    >
      {failure ? <FailureBanner failure={failure} /> : null}
      {rows.length === 0 ? (
        <MobileEmpty>No prep tasks for this event yet.</MobileEmpty>
      ) : (
        shown.map((task) => {
          const action = nextAction(String(task.status));
          // PrepTask.start rejects while a predecessor is open; say so instead
          // of offering a button that ends in a policy error.
          const waiting =
            action?.verb === "start"
              ? prepTaskDependencySummary(
                  task._id,
                  (tasks ?? []).filter((row) => row.deletedAt == null),
                  dependencies ?? [],
                )
              : null;
          const quantity = Number(task.quantity) || 0;
          const sub = [
            quantity > 0
              ? `${prepQuantityLabel(quantity, String(task.unit))} ${String(task.unit)}`
              : "",
            task.station ?? "",
            formatStatusLabel(String(task.status)),
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={task._id} className="mobile-row">
              <span className="mobile-row-main">
                <span
                  className={`block truncate ${task.status === "completed" ? "text-ink-3 line-through" : ""}`}
                >
                  {task.name}
                </span>
                <span className="mobile-row-sub truncate">{sub}</span>
              </span>
              {waiting?.isBlocked ? (
                <span className="mobile-row-sub max-w-40 min-w-0 text-right">
                  Waiting on {waiting.blockerNames.join(", ")}
                </span>
              ) : action ? (
                <button
                  type="button"
                  className={`btn ${action.verb === "complete" ? "btn-primary" : "btn-ghost"} min-h-11 shrink-0`}
                  disabled={busy != null}
                  onClick={() => void run(task, action.verb)}
                >
                  {busy === task._id ? "…" : action.label}
                </button>
              ) : null}
            </div>
          );
        })
      )}
      <MobileMore count={rows.length - shown.length} />
    </MobileSectionCard>
  );
}
