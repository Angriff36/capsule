import { Fragment, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCaptureCloseoutFromSources,
  useCorrectCloseoutFromSources,
  useEventCloseoutSources,
} from "../facilities/useCloseoutSources";
import { useEventCloseoutFinalize } from "../../lib/manifest-convex-react";
import {
  useCloseoutsForEvents,
  useCloseoutsInStatus,
  useInvoicesForEvents,
  usePagedRows,
} from "../../lib/financeScopedQueries";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  formatCountNoun,
  formatDate,
  formatMoneyExact,
} from "../../lib/format";
import {
  CLOSEOUT_EVIDENCE_CATEGORIES,
  RecordPhotoCapture,
} from "../attachments/RecordPhotoCapture";
import { CloseoutCaptureForm, type CloseoutDraft } from "./CloseoutCaptureForm";
import { CloseoutCorrectionPanel } from "./CloseoutCorrectionPanel";
import { enteredAmounts } from "./CloseoutSourcesPanel";
import {
  CloseoutRevenueNote,
  isUnreconciledCloseout,
} from "./CloseoutBillingTruth";
import { CloseoutLifecyclePolicy } from "./CloseoutLifecyclePolicy";
import { rollupEventBilling } from "./invoiceBilling";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { EventCostSummaryReport } from "./EventCostSummaryReport";
import { EventFoodCostPanel } from "./EventFoodCostPanel";
import { LeftoverDispositionPanel } from "./LeftoverDispositionPanel";
import { EventEquipmentProblems } from "../events/EventEquipmentProblems";
import { canReadEventFoodCost } from "../../lib/culinaryDemandClient";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useActionNotice } from "../../ui/action-result";
import { useActionPrompt } from "../../ui/action-prompt";
import {
  closeoutListedCost,
  isCloseoutListProfitPending,
} from "./eventCostSummary";
import {
  useWorkingEventScope,
  WorkingEventScopeNote,
} from "../events/WorkingEventScope";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";

const policy = new CloseoutLifecyclePolicy();

const note = (data: FormData, name: string) =>
  String(data.get(name) || "").trim() || undefined;

export function CloseoutPage() {
  const eventScope = useWorkingEventScope("closeout");
  const authStatus = useAuthStatus();
  const [showFinalized, setShowFinalized] = useState(false);
  // Only the closeouts shown: the working event's, else every unfinished
  // one (through the status index), plus (finalized shown) the newest page
  // with "Load more".
  const eventCloseouts = useCloseoutsForEvents(
    eventScope.scopeId ? [eventScope.scopeId] : undefined,
  );
  const draftCloseouts = useCloseoutsInStatus(
    eventScope.scopeId ? null : "draft",
  );
  const pagedCloseouts = usePagedRows(
    "eventCloseouts",
    !eventScope.scopeId && showFinalized,
  );
  const closeouts = eventScope.scopeId
    ? eventCloseouts
    : draftCloseouts === undefined ||
        (showFinalized && pagedCloseouts.rows === undefined)
      ? undefined
      : [
          ...new Map(
            [...draftCloseouts, ...(pagedCloseouts.rows ?? [])].map((row) => [
              row._id,
              row,
            ]),
          ).values(),
        ];
  const events = usePickerAndNamedEvents(
    closeouts
      ? [eventScope.workingId, ...closeouts.map((row) => row.eventId)]
      : undefined,
  );
  const captureCloseout = useCaptureCloseoutFromSources();
  const correctCloseout = useCorrectCloseoutFromSources();
  const finalize = useEventCloseoutFinalize();
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CloseoutDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { prompt, host: promptHost } = useActionPrompt(busy != null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const [summaryCloseoutId, setSummaryCloseoutId] = useState<string | null>(
    null,
  );
  const [photoCloseoutId, setPhotoCloseoutId] = useState<string | null>(null);
  const [leftoverCloseoutId, setLeftoverCloseoutId] = useState<string | null>(
    null,
  );

  const activeCloseouts = (closeouts ?? []).filter(
    (row) => row.deletedAt == null,
  );
  const scopedCloseouts = activeCloseouts.filter(
    (row) =>
      eventScope.scopeId == null ||
      String(row.eventId ?? "") === eventScope.scopeId,
  );
  const visibleRows = showFinalized
    ? scopedCloseouts
    : scopedCloseouts.filter((row) => String(row.status) !== "finalized");
  // Newest event first, the order the team closes them out.
  const startsAt = (row: { eventId?: unknown }) =>
    Number(
      events?.find((event) => event._id === String(row.eventId))?.startsAt ?? 0,
    );
  visibleRows.sort((a, b) => startsAt(b) - startsAt(a));
  // Closed-out events offered for capture, less those with a closeout of any
  // state (read for these events only).
  const candidateEvents = (events ?? []).filter(
    (event) => event.deletedAt == null && String(event.stage) === "closed_out",
  );
  const candidateCloseouts = useCloseoutsForEvents(
    events === undefined ? undefined : candidateEvents.map((row) => row._id),
  );
  const closedOutEventIds = new Set(
    [...activeCloseouts, ...(candidateCloseouts ?? [])]
      .filter((row) => row.deletedAt == null)
      .map((row) => String(row.eventId)),
  );
  const capturableEvents = candidateEvents.filter(
    (event) => !closedOutEventIds.has(event._id),
  );
  // Billing for the closeouts shown only.
  const invoices = useInvoicesForEvents(
    visibleRows.map((row) => String(row.eventId)),
  );

  const eventFor = (id: string) => events?.find((event) => event._id === id);
  const eventTitle = (id: string) => eventFor(id)?.title ?? "Unknown event";
  const summaryCloseout = activeCloseouts.find(
    (row) => String(row._id) === summaryCloseoutId,
  );
  const summaryEvent = summaryCloseout
    ? eventFor(String(summaryCloseout.eventId))
    : undefined;

  // The event whose records the capture form is adding up.
  const formEventId =
    draft?.eventId != null
      ? String(draft.eventId)
      : (selectedEventId ?? capturableEvents[0]?._id ?? null);
  const sources = useEventCloseoutSources(
    showCapture && formEventId ? formEventId : null,
  );

  const formEvents = draft
    ? (events ?? []).filter((event) => event._id === String(draft.eventId))
    : capturableEvents;
  const billingFor = (eventId: string) =>
    rollupEventBilling(invoices ?? [], eventId);

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const openCapture = () => {
    setDraft(null);
    setSelectedEventId(
      capturableEvents.some((event) => event._id === eventScope.workingId)
        ? eventScope.workingId
        : null,
    );
    setShowCapture(true);
  };

  const openReconcile = (row: (typeof activeCloseouts)[number]) => {
    setDraft({ _id: String(row._id), eventId: String(row.eventId) });
    setShowCapture(true);
  };

  const submitCapture = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!sources || !formEventId) return;
    try {
      const data = new FormData(form);
      const entered = enteredAmounts(data);
      void run("capture-closeout", async () => {
        await captureCloseout({
          eventId: formEventId,
          entered,
          unresolvedIssues: note(data, "unresolvedIssues"),
          performanceNotes: note(data, "performanceNotes"),
          notes: note(data, "notes"),
        });
        setNotice(
          draft
            ? "Closeout reconciled. Finalize when numbers are final."
            : "Closeout captured as draft. Finalize when numbers are final.",
        );
        form.reset();
        setShowCapture(false);
        setDraft(null);
      });
    } catch (error) {
      setFailure(error);
    }
  };

  const submitCorrection =
    (closeoutId: string) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      try {
        const data = new FormData(event.currentTarget);
        const entered = enteredAmounts(data);
        void run(`${closeoutId}:correct`, async () => {
          await correctCloseout({
            closeoutId,
            reason: String(data.get("reason") || ""),
            entered,
          });
          setNotice("Correction saved. The earlier result is kept.");
          setCorrectingId(null);
        });
      } catch (error) {
        setFailure(error);
      }
    };

  const invokeFinalize = async (
    row: Parameters<typeof isCloseoutListProfitPending>[0] & {
      _id: string;
      version: number;
    },
  ) => {
    // A draft made when the event closed out has no costs until someone
    // reconciles it; finalizing it as-is freezes $0 cost.
    if (
      isCloseoutListProfitPending(row) &&
      !(await prompt.askConfirm({
        title: "Finalize with no costs?",
        description:
          "Nobody has reconciled this closeout, so it has $0 cost: clocked time, purchases and rentals are not in it yet. Reconcile first to bring them in, or finalize it as it is.",
        confirmLabel: "Finalize at $0 cost",
      }))
    )
      return;
    void run(`${row._id}:finalize`, async () => {
      await finalize({ docId: row._id, version: row.version });
      setNotice("Closeout finalized. Numbers are frozen.");
    });
  };

  const loading =
    closeouts === undefined || events === undefined || invoices === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Finance · Closeout</p>
          <h1 className="display-title mt-2">Event closeouts</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Capture revenue, cost, and headcount for a closed-out event, then
            finalize to freeze the folio. The numbers come from the event's
            invoices, payments, deliveries, clocked time, rentals and guest
            check-ins; you only fill in what they can't answer.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowFinalized((value) => !value)}
          >
            {showFinalized ? "Hide finalized" : "Show finalized"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() =>
              showCapture ? setShowCapture(false) : openCapture()
            }
          >
            {showCapture ? "Close form" : "Capture closeout"}
          </button>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {summaryCloseout && summaryEvent ? (
        <EventCostSummaryReport
          event={summaryEvent}
          closeout={summaryCloseout}
          invoices={invoices ?? []}
          onClose={() => setSummaryCloseoutId(null)}
        />
      ) : null}
      {summaryCloseout ? (
        <EventFoodCostPanel
          eventId={String(summaryCloseout.eventId)}
          enabled={canReadEventFoodCost(authStatus?.role)}
        />
      ) : null}
      {summaryCloseout ? (
        <EventEquipmentProblems
          eventId={String(summaryCloseout.eventId)}
          hideWhenEmpty
        />
      ) : null}
      {showCapture && formEventId ? (
        <EventEquipmentProblems eventId={formEventId} hideWhenEmpty />
      ) : null}

      {showCapture ? (
        <CloseoutCaptureForm
          events={formEvents}
          selectedEventId={formEventId}
          onSelectEvent={setSelectedEventId}
          sources={sources}
          draft={draft}
          busy={busy === "capture-closeout"}
          onSubmit={submitCapture}
        />
      ) : null}

      <WorkingEventScopeNote scope={eventScope} noun="closeouts" />
      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Reconciliation</p>
            <h2>Closeout folios</h2>
          </div>
          <span>
            {showFinalized && !eventScope.scopeId
              ? `${visibleRows.filter((row) => String(row.status) !== "finalized").length} open · ${visibleRows.filter((row) => String(row.status) === "finalized").length} finalized shown`
              : formatCountNoun(visibleRows.length, "closeout")}
          </span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No open closeouts.</p>
            <span>
              Capture numbers after an event reaches closed-out stage.{" "}
              <Link className="text-link" to="/events">
                Open Events
              </Link>
            </span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={openCapture}
              >
                Capture closeout
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Billed (with tax)</th>
                  <th>Revenue</th>
                  <th>Cost</th>
                  <th>Gross profit</th>
                  <th>Headcount</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const event = eventFor(String(row.eventId));
                  const unreconciled = isUnreconciledCloseout(row);
                  // Seeded drafts carry zero headcount — the event's planned
                  // headcount is the honest expected figure until reconciled.
                  const expectedHeadcount =
                    Number(row.expectedHeadcount ?? 0) > 0
                      ? Number(row.expectedHeadcount)
                      : Number(event?.expectedHeadcount ?? 0);
                  const actualHeadcount = Number(row.actualHeadcount ?? 0);
                  const billing = billingFor(String(row.eventId));
                  const listedCost = closeoutListedCost(row);
                  return (
                    <Fragment key={row._id}>
                      <tr>
                        <td>
                          <Link
                            className="text-link"
                            to={`/events/${String(row.eventId)}`}
                          >
                            <strong>{eventTitle(String(row.eventId))}</strong>
                          </Link>
                          {eventFor(String(row.eventId))?.startsAt ? (
                            <span className="ml-2 text-sm text-ink-2">
                              {formatDate(
                                Number(eventFor(String(row.eventId))?.startsAt),
                              )}
                            </span>
                          ) : null}
                          <CloseoutRevenueNote row={row} billing={billing} />
                        </td>
                        <td>{formatMoneyExact(billing.billedTotal)}</td>
                        <td>
                          {isCloseoutListProfitPending(row)
                            ? "—"
                            : formatMoneyExact(Number(row.actualRevenue ?? 0))}
                        </td>
                        <td>
                          {listedCost == null
                            ? "—"
                            : formatMoneyExact(listedCost)}
                        </td>
                        <td>
                          {isCloseoutListProfitPending(row)
                            ? "—"
                            : formatMoneyExact(Number(row.grossProfit ?? 0))}
                        </td>
                        <td>
                          {unreconciled && actualHeadcount === 0
                            ? "—"
                            : actualHeadcount}
                          /{expectedHeadcount}
                        </td>
                        <td>
                          <StatusChip status={String(row.status)} />
                        </td>
                        <td>
                          <div className="supply-row-actions">
                            {String(row.status) === "draft" ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                disabled={busy != null}
                                onClick={() => openReconcile(row)}
                              >
                                Reconcile
                              </button>
                            ) : null}
                            {policy
                              .closeoutActions(
                                String(row.status),
                                row.capturedAt,
                              )
                              .map((action) => (
                                <button
                                  key={action.key}
                                  className="btn btn-ghost btn-sm"
                                  disabled={busy != null}
                                  onClick={() => void invokeFinalize(row)}
                                >
                                  {busy === `${row._id}:${action.key}`
                                    ? "Working…"
                                    : action.label}
                                </button>
                              ))}
                            {event?.clientId ? (
                              <Link
                                className="btn btn-ghost btn-sm"
                                to={FINANCE_ROUTES.issueInvoice({
                                  clientId: String(event.clientId),
                                  eventId: String(row.eventId),
                                })}
                              >
                                Issue invoice
                              </Link>
                            ) : null}
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() =>
                                setSummaryCloseoutId(String(row._id))
                              }
                            >
                              Cost summary
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              aria-expanded={leftoverCloseoutId === row._id}
                              onClick={() =>
                                setLeftoverCloseoutId((current) =>
                                  current === row._id ? null : row._id,
                                )
                              }
                            >
                              {leftoverCloseoutId === row._id
                                ? "Hide leftovers"
                                : "Leftovers"}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              aria-expanded={photoCloseoutId === row._id}
                              onClick={() =>
                                setPhotoCloseoutId((current) =>
                                  current === row._id ? null : row._id,
                                )
                              }
                            >
                              {photoCloseoutId === row._id
                                ? "Hide photos"
                                : "Photos"}
                            </button>
                            {String(row.status) === "finalized" ? (
                              <>
                                <span className="text-sm text-ink-3">
                                  Final
                                  {Number(row.revision ?? 1) > 1
                                    ? ` · corrected ${Number(row.revision) - 1 === 1 ? "once" : `${Number(row.revision) - 1} times`}`
                                    : ""}
                                </span>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  type="button"
                                  aria-expanded={correctingId === row._id}
                                  onClick={() =>
                                    setCorrectingId((current) =>
                                      current === row._id ? null : row._id,
                                    )
                                  }
                                >
                                  {correctingId === row._id
                                    ? "Close correction"
                                    : "Correct"}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {correctingId === row._id ? (
                        <tr>
                          <td colSpan={8} className="!p-3">
                            <CloseoutCorrectionPanel
                              closeoutId={row._id}
                              eventId={String(row.eventId)}
                              busy={busy === `${row._id}:correct`}
                              onSubmit={submitCorrection(row._id)}
                            />
                          </td>
                        </tr>
                      ) : null}
                      {leftoverCloseoutId === row._id ? (
                        <tr>
                          <td colSpan={8} className="!p-3">
                            <LeftoverDispositionPanel
                              eventId={String(row.eventId)}
                            />
                          </td>
                        </tr>
                      ) : null}
                      {photoCloseoutId === row._id ? (
                        <tr>
                          <td colSpan={8} className="!p-3">
                            <RecordPhotoCapture
                              parentType="closeout"
                              parentId={row._id}
                              title="Closeout evidence"
                              description="Attach venue, leftover-food, or equipment-return photos that support waste claims and credit adjustments."
                              evidenceCategories={CLOSEOUT_EVIDENCE_CATEGORIES}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!eventScope.scopeId && showFinalized && pagedCloseouts.canLoadMore ? (
          <div className="px-4 py-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pagedCloseouts.loadingMore}
              onClick={pagedCloseouts.loadMore}
            >
              {pagedCloseouts.loadingMore ? "Loading…" : "Load older closeouts"}
            </button>
          </div>
        ) : null}
      </section>

      <p className="mt-4 text-sm text-ink-3">
        Payroll inputs live under{" "}
        <Link className="text-link" to={FINANCE_ROUTES.payroll}>
          Payroll
        </Link>
        . Use{" "}
        <Link className="text-link" to={FINANCE_ROUTES.invoices}>
          Invoices
        </Link>{" "}
        for billing collection.
      </p>
      {promptHost}
    </div>
  );
}
