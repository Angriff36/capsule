import { Fragment, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEventLaborSummary } from "../facilities/useLaborSummary";
import {
  useCreateEventCloseout,
  useEventCloseoutCapture,
  useEventCloseoutFinalize,
  useListEvent,
  useListEventCloseout,
  useListInvoice,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatMoneyExact } from "../../lib/format";
import {
  CLOSEOUT_EVIDENCE_CATEGORIES,
  RecordPhotoCapture,
} from "../attachments/RecordPhotoCapture";
import {
  CloseoutCaptureForm,
  CloseoutCapturePayloadBuilder,
  type CloseoutDraft,
} from "./CloseoutCaptureForm";
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
import {
  closeoutListedCost,
  isCloseoutListProfitPending,
} from "./eventCostSummary";

const policy = new CloseoutLifecyclePolicy();
const payloadBuilder = new CloseoutCapturePayloadBuilder();

export function CloseoutPage() {
  const closeouts = useListEventCloseout();
  const events = useListEvent();
  const invoices = useListInvoice();
  const createCloseout = useCreateEventCloseout();
  const captureCloseout = useEventCloseoutCapture();
  const finalize = useEventCloseoutFinalize();
  const [showCapture, setShowCapture] = useState(false);
  const [showFinalized, setShowFinalized] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CloseoutDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summaryCloseoutId, setSummaryCloseoutId] = useState<string | null>(
    null,
  );
  const [photoCloseoutId, setPhotoCloseoutId] = useState<string | null>(null);

  const activeCloseouts = (closeouts ?? []).filter(
    (row) => row.deletedAt == null,
  );
  const visibleRows = showFinalized
    ? activeCloseouts
    : activeCloseouts.filter((row) => String(row.status) !== "finalized");
  const closedOutEventIds = new Set(
    activeCloseouts.map((row) => String(row.eventId)),
  );
  const capturableEvents = (events ?? []).filter(
    (event) =>
      event.deletedAt == null &&
      String(event.stage) === "closed_out" &&
      !closedOutEventIds.has(event._id),
  );

  const eventFor = (id: string) => events?.find((event) => event._id === id);
  const eventTitle = (id: string) => eventFor(id)?.title ?? "Unknown event";
  const summaryCloseout = activeCloseouts.find(
    (row) => String(row._id) === summaryCloseoutId,
  );
  const summaryEvent = summaryCloseout
    ? eventFor(String(summaryCloseout.eventId))
    : undefined;

  // The event whose clocked labor the capture form is showing.
  const formEventId =
    draft?.eventId != null
      ? String(draft.eventId)
      : (selectedEventId ?? capturableEvents[0]?._id ?? null);
  const labor = useEventLaborSummary(
    showCapture && formEventId ? formEventId : null,
  );

  const formEvents = draft
    ? (events ?? []).filter((event) => event._id === String(draft.eventId))
    : capturableEvents;
  const billingFor = (eventId: string) =>
    rollupEventBilling(invoices ?? [], eventId);
  const formBilling =
    showCapture && formEventId
      ? invoices === undefined
        ? undefined
        : billingFor(formEventId)
      : null;

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
    setSelectedEventId(null);
    setShowCapture(true);
  };

  const openReconcile = (row: (typeof activeCloseouts)[number]) => {
    setDraft({
      _id: String(row._id),
      version: Number(row.version),
      eventId: String(row.eventId),
      actualRevenue: row.actualRevenue,
      budgetedRevenue: row.budgetedRevenue,
      actualIngredientCost: row.actualIngredientCost,
      actualWasteCost: row.actualWasteCost,
      actualLaborCost: row.actualLaborCost,
      actualVendorCost: row.actualVendorCost,
      budgetedCost: row.budgetedCost,
      expectedHeadcount: row.expectedHeadcount,
      actualHeadcount: row.actualHeadcount,
    });
    setShowCapture(true);
  };

  const submitCapture = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const payload = payloadBuilder.fromForm(new FormData(form));
      void run("capture-closeout", async () => {
        if (draft) {
          await captureCloseout({
            docId: draft._id,
            version: draft.version,
            ...payload,
          });
          setNotice("Closeout reconciled. Finalize when numbers are final.");
        } else {
          await createCloseout(payload);
          setNotice(
            "Closeout captured as draft. Finalize when numbers are final.",
          );
        }
        form.reset();
        setShowCapture(false);
        setDraft(null);
      });
    } catch (error) {
      setFailure(error);
    }
  };

  const invokeFinalize = (row: { _id: string; version: number }) => {
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
            Capture reconciled revenue, cost, and headcount for a closed-out
            event, then finalize to freeze the folio. Labor pre-fills from
            clocked time and pay rates.
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

      {showCapture ? (
        <CloseoutCaptureForm
          events={formEvents}
          selectedEventId={formEventId}
          onSelectEvent={setSelectedEventId}
          labor={labor}
          billing={formBilling}
          draft={draft}
          busy={busy === "capture-closeout"}
          onSubmit={submitCapture}
        />
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Reconciliation</p>
            <h2>Closeout folios</h2>
          </div>
          <span>{visibleRows.length} closeouts</span>
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
                  <th>Billed</th>
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
                          <CloseoutRevenueNote row={row} billing={billing} />
                        </td>
                        <td>{formatMoneyExact(billing.billedTotal)}</td>
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
                                  onClick={() => invokeFinalize(row)}
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
                              <span className="text-sm text-ink-3">Frozen</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {photoCloseoutId === row._id ? (
                        <tr>
                          <td colSpan={7} className="!p-3">
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
    </div>
  );
}
