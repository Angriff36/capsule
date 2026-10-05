import { useState } from "react";
import { Link } from "react-router-dom";
import type { Doc } from "../../lib/api";
import {
  useCreateDateHold,
  useCreateDateWaitlistEntry,
  useDateHoldExpire,
  useDateHoldExtend,
  useDateHoldRelease,
  useDateWaitlistEntryOffer,
  useDateWaitlistEntryPromote,
  useDateWaitlistEntryWithdraw,
  useListClient,
  useListDateHold,
  useListDateWaitlistEntry,
} from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import {
  EmptyState,
  PageHeader,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { classifyCommandFailure } from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { clientDisplayName } from "../events/clientName";
import { ClientsWorkspaceNav } from "../clients/ClientsWorkspaceNav";
import { DateHoldForm, type DateHoldFormValues } from "./DateHoldForm";
import {
  DEFAULT_HOLD_DAYS,
  dateKeyToMs,
  effectiveHoldStatus,
  isActiveHold,
  isLapsedHold,
  isOpenWaitlistEntry,
  localDateKey,
  openedDates,
  waitlistFor,
} from "./dateHolds";

type Failure = ReturnType<typeof classifyCommandFailure>;
const DAY_MS = 86_400_000;

/**
 * Sales date board: soft holds with an automatic expiry, a first-come
 * waitlist per date, and a prompt when a held date opens for the next client.
 * Holds only warn; a date may carry several holds and bookings.
 */
export function DateHoldsPage() {
  const holds = useListDateHold();
  const waitlist = useListDateWaitlistEntry();
  const clients = useListClient();
  const createHold = useCreateDateHold();
  const joinWaitlist = useCreateDateWaitlistEntry();
  const extendHold = useDateHoldExtend();
  const releaseHold = useDateHoldRelease();
  const expireHold = useDateHoldExpire();
  const offerEntry = useDateWaitlistEntryOffer();
  const promoteEntry = useDateWaitlistEntryPromote();
  const withdrawEntry = useDateWaitlistEntryWithdraw();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const run = async (work: () => Promise<unknown>): Promise<boolean> => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
      return true;
    } catch (err) {
      setFailure(classifyCommandFailure(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const holdFor = (
    dateKey: string,
    clientId: string | undefined,
    note: string | undefined,
    days: number,
  ) =>
    createHold({
      holdDate: dateKey,
      expiresAt: Date.now() + days * DAY_MS,
      ...(clientId ? { clientId } : {}),
      ...(note ? { note } : {}),
    });

  const submit = (values: DateHoldFormValues) =>
    run(() =>
      values.mode === "hold"
        ? holdFor(values.dateKey, values.clientId, values.note, values.holdDays)
        : joinWaitlist({
            holdDate: values.dateKey,
            ...(values.clientId ? { clientId: values.clientId } : {}),
            ...(values.note ? { note: values.note } : {}),
          }),
    );

  // The next client takes the date: their entry is promoted and a fresh
  // hold is placed in their name.
  const promote = (entry: Doc<"dateWaitlistEntries">) =>
    run(async () => {
      await promoteEntry({ docId: entry._id });
      await holdFor(
        entry.holdDate,
        entry.clientId ?? undefined,
        entry.note ?? undefined,
        DEFAULT_HOLD_DAYS,
      );
    });

  const header = (
    <div className="mb-4">
      <PageHeader
        title="Date holds"
        lead="Soft holds on dates for prospects. A hold lapses on its own at its expiry; holds warn, they never block a booking."
      />
    </div>
  );

  if (holds === undefined || waitlist === undefined) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        {header}
        <ClientsWorkspaceNav />
        <TableSkeleton />
      </div>
    );
  }

  const now = Date.now();
  const today = localDateKey(now);
  const who = (row: { clientId?: string | null; note?: string | null }) =>
    row.clientId
      ? // Keep the sales note next to the client so "call back Friday" shows.
        [clientDisplayName(row.clientId, clients), row.note]
          .filter(Boolean)
          .join(" · ")
      : (row.note ?? "Unnamed prospect");
  const opened = openedDates(holds, waitlist, now);
  const dates = [
    ...new Set(
      [
        ...holds
          .filter((h) => isActiveHold(h, now) || isLapsedHold(h, now))
          .map((h) => h.holdDate),
        ...waitlist.filter(isOpenWaitlistEntry).map((e) => e.holdDate),
      ].filter((key) => key >= today),
    ),
  ].sort();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {header}
      <ClientsWorkspaceNav />
      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}

      {opened.map(({ dateKey, next }) => (
        <div
          key={dateKey}
          role="status"
          className="p-3 bg-ok-soft border border-ok/40 rounded-sm text-xs text-ok flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            <strong>{formatDate(dateKeyToMs(dateKey))}</strong> is open again.
            Next on the waitlist: <strong>{who(next)}</strong>.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => run(() => offerEntry({ docId: next._id }))}
            >
              Mark contacted
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => promote(next)}
            >
              Hold it for them
            </button>
          </span>
        </div>
      ))}

      <DateHoldForm clients={clients} busy={busy} onSubmit={submit} />

      {dates.length === 0 ? (
        <EmptyState
          title="No dates held"
          hint="Hold a date for a prospect above. It lapses on its own at the expiry."
        />
      ) : (
        <div className="space-y-3">
          {dates.map((dateKey) => {
            const dayHolds = holds.filter(
              (h) =>
                h.holdDate === dateKey &&
                (isActiveHold(h, now) || isLapsedHold(h, now)),
            );
            const queue = waitlistFor(waitlist, dateKey);
            return (
              <section
                key={dateKey}
                className="bg-panel border border-line rounded-sm p-4"
                aria-label={formatDate(dateKeyToMs(dateKey))}
              >
                <h2 className="font-semibold text-ink">
                  {new Date(dateKeyToMs(dateKey)).toLocaleDateString("en-US", {
                    weekday: "long",
                  })}
                  , {formatDate(dateKeyToMs(dateKey))}
                </h2>
                <ul className="mt-2 space-y-2">
                  {dayHolds.map((hold) => {
                    const lapsed = isLapsedHold(hold, now);
                    return (
                      <li
                        key={hold._id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <StatusChip status={effectiveHoldStatus(hold, now)} />
                          {who(hold)}
                          <span className="text-xs text-ink-2">
                            {lapsed ? "lapsed" : "until"}{" "}
                            {formatDate(hold.expiresAt)}
                          </span>
                        </span>
                        <span className="flex gap-2">
                          {lapsed ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() =>
                                run(() => expireHold({ docId: hold._id }))
                              }
                            >
                              Clear
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  run(() =>
                                    extendHold({
                                      docId: hold._id,
                                      expiresAt:
                                        hold.expiresAt +
                                        DEFAULT_HOLD_DAYS * DAY_MS,
                                    }),
                                  )
                                }
                              >
                                +{DEFAULT_HOLD_DAYS} days
                              </button>
                              <Link
                                to={`/events/new?${new URLSearchParams({
                                  date: hold.holdDate,
                                  holdId: hold._id,
                                  ...(hold.clientId
                                    ? { clientId: hold.clientId }
                                    : {}),
                                })}`}
                                className="btn btn-ghost btn-sm"
                              >
                                Book event
                              </Link>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  run(() => releaseHold({ docId: hold._id }))
                                }
                              >
                                Release
                              </button>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {queue.length > 0 && (
                  <>
                    <h3 className="mt-3 text-xs font-medium text-ink-2">
                      Waitlist
                    </h3>
                    <ol className="mt-1 space-y-2 list-decimal pl-5">
                      {queue.map((entry) => (
                        <li key={entry._id} className="text-sm">
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              {who(entry)}
                              {entry.status === "offered" && (
                                <StatusChip
                                  status="offered"
                                  label="Contacted"
                                />
                              )}
                            </span>
                            <span className="flex gap-2">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => promote(entry)}
                              >
                                Hold for them
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  run(() => withdrawEntry({ docId: entry._id }))
                                }
                              >
                                Remove
                              </button>
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
