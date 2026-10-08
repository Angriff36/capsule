import { useClientDirectory } from "../../lib/useClientDirectory";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useContractExpire,
  useContractMarkViewed,
  useContractMarkVoided,
  useContractSend,
  useContractSign,
  useCreateContract,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { FINANCE_ROUTES } from "../finance/financeRoutes";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { CrmLifecyclePolicy } from "./CrmLifecyclePolicy";
import { useActionNotice } from "../../ui/action-result";
import { useWorkingEventId } from "../events/workingEvent";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";
import {
  usePagedRows,
  useRowsInStatuses,
} from "../../lib/financeScopedQueries";

const policy = new CrmLifecyclePolicy();
// Not yet signed, expired or voided.
const OPEN_STATUSES = ["draft", "sent", "viewed"];

export function ContractsPage() {
  const workingId = useWorkingEventId();
  // Every unsigned contract (through the status index), and the newest
  // finished ones a page at a time ("Load more" reads older ones).
  const openContracts = useRowsInStatuses("contracts", OPEN_STATUSES);
  const contractPages = usePagedRows("contracts");
  const contracts =
    openContracts === undefined || contractPages.rows === undefined
      ? undefined
      : [
          ...new Map(
            [...openContracts, ...contractPages.rows].map((row) => [
              row._id,
              row,
            ]),
          ).values(),
        ];
  const clients = useClientDirectory();
  const events = usePickerAndNamedEvents([workingId]);
  const createContract = useCreateContract();
  const send = useContractSend();
  const markViewed = useContractMarkViewed();
  const sign = useContractSign();
  const expire = useContractExpire();
  const markVoided = useContractMarkVoided();
  const [showDraft, setShowDraft] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const { prompt, host } = useActionPrompt(busy != null);

  const activeClients = (clients ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.registeredAt != null &&
      String(row.status) === "active",
  );
  const draftableEvents = (events ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      !["cancelled", "completed", "closed"].includes(String(row.stage)),
  );
  const activeRows = (contracts ?? []).filter((row) => row.deletedAt == null);
  // Keep signed contracts visible — operators issue invoices from them.
  const visibleRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) => !["expired", "voided"].includes(String(row.status)),
      );

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

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const eventId = String(data.get("eventId") || "").trim();
    const eventRow = events?.find((row) => row._id === eventId);
    // Left blank, the title is the usual one for that event.
    const title =
      String(data.get("title") || "").trim() ||
      (eventRow?.title ? `Catering agreement - ${eventRow.title}` : "");
    // The contract is with the event's own client; asking again only let
    // someone pick a different one and be refused.
    const clientId = String(eventRow?.clientId ?? "");
    if (!eventId || !title) {
      setFailure(new Error("Pick an event and give the contract a title."));
      return;
    }
    if (!clientId) {
      setFailure(
        new Error("This event has no client yet. Add one on the event first."),
      );
      return;
    }
    void run("draft-contract", async () => {
      await createContract({
        eventId,
        clientId,
        title,
        notes: String(data.get("notes") || "").trim() || undefined,
        documentUrl: String(data.get("documentUrl") || "").trim() || undefined,
      });
      form.reset();
      setShowDraft(false);
      setNotice(
        "Contract drafted. Deliver the document outside Capsule, then mark it sent here.",
      );
    });
  };

  const invoke = (
    row: { _id: string; version: number; status: unknown },
    key: string,
  ) => {
    void (async () => {
      if (key === "sign") {
        const signedBy = await prompt.askReason({
          ...ReasonCopy.signContract,
        });
        if (!signedBy) return;
        void run(`${row._id}:sign`, async () => {
          await sign({
            docId: row._id,
            version: row.version,
            signedBy,
          });
          setNotice(
            "Contract signed. If the event isn't confirmed yet, confirm it on the Events page.",
          );
        });
        return;
      }
      if (key === "void") {
        const reason = await prompt.askReason({
          ...ReasonCopy.voidContract,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:void`, async () => {
          await markVoided({
            docId: row._id,
            version: row.version,
            reason,
          });
          setNotice("Contract voided.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        const args = { docId: row._id, version: row.version };
        if (key === "send") await send(args);
        if (key === "markViewed") await markViewed(args);
        if (key === "expire") await expire(args);
        setNotice(
          key === "send"
            ? "Contract marked sent in Capsule. Deliver its document or signature link through your external channel."
            : key === "markViewed"
              ? "Contract marked as viewed."
              : key === "expire"
                ? "Contract marked as expired."
                : "Contract updated.",
        );
      });
    })();
  };

  const loading =
    contracts === undefined || clients === undefined || events === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Contracts</p>
          <h1 className="display-title mt-2">Contracts</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Written agreements for booked events. Draft one, send it to your
            client, and log the signature when it comes back.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
          >
            {showTerminal ? "Hide expired/voided" : "Show expired/voided"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowDraft((value) => !value)}
          >
            {showDraft ? "Close form" : "Draft contract"}
          </button>
        </div>
      </header>
      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showDraft ? (
        <form className="supply-form" onSubmit={submitDraft}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Draft</p>
              <h2>New contract</h2>
            </div>
          </div>
          {activeClients.length === 0 || draftableEvents.length === 0 ? (
            <p className="text-base text-ink-2">
              You need an active client and an open event first.{" "}
              <Link className="text-link" to={CLIENTS_ROUTES.root}>
                Clients
              </Link>{" "}
              ·{" "}
              <Link className="text-link" to="/events">
                Events
              </Link>
              .
            </p>
          ) : (
            <>
              <label>
                Event
                <select
                  key={
                    draftableEvents.length ? "events-ready" : "events-loading"
                  }
                  name="eventId"
                  required
                  defaultValue={workingId ?? ""}
                >
                  <option value="" disabled>
                    Select event
                  </option>
                  {draftableEvents.map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.title || row._id} (
                      {clientDisplayName(row.clientId, clients)})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input
                  name="title"
                  placeholder="Catering agreement - (event name)"
                />
              </label>
              <label>
                Document URL
                <input name="documentUrl" />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={2} />
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy === "draft-contract"}
              >
                Draft contract
              </button>
            </>
          )}
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Agreements</p>
            <h2>Contracts</h2>
          </div>
          <span>
            {`${visibleRows.filter((row) => OPEN_STATUSES.includes(String(row.status))).length} open · ${visibleRows.filter((row) => !OPEN_STATUSES.includes(String(row.status))).length} closed shown`}
          </span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No open contracts.</p>
          </div>
        ) : (
          <table className="data-table phone-cards">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row._id}>
                  <td>{row.title}</td>
                  <td data-label="Client">
                    {clientDisplayName(row.clientId, clients)}
                  </td>
                  <td data-label="Status">
                    <StatusChip status={String(row.status)} />
                  </td>
                  <td className="supply-row-actions">
                    {policy
                      .contractActions(String(row.status))
                      .map((action) => (
                        <button
                          key={action.key}
                          className="btn btn-ghost"
                          type="button"
                          disabled={busy != null}
                          onClick={() => invoke(row, action.key)}
                        >
                          {action.key === "send" ? "Mark sent" : action.label}
                        </button>
                      ))}
                    <Link
                      className="btn btn-ghost"
                      to={CLIENTS_ROUTES.contractDocument(row._id)}
                    >
                      PDF
                    </Link>
                    {String(row.status) === "signed" ? (
                      <Link
                        className="btn btn-ghost"
                        to={FINANCE_ROUTES.issueInvoice({
                          clientId: String(row.clientId),
                          eventId: String(row.eventId),
                        })}
                      >
                        Issue invoice
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {contracts !== undefined && contractPages.canLoadMore ? (
          <div className="px-4 py-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={contractPages.loadingMore}
              onClick={contractPages.loadMore}
            >
              {contractPages.loadingMore ? "Loading…" : "Load older contracts"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
