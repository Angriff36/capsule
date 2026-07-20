import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateProposal,
  useListClient,
  useListProposal,
  useProposalAccept,
  useProposalDecline,
  useProposalExpire,
  useProposalMarkViewed,
  useProposalSend,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { CrmLifecyclePolicy } from "./CrmLifecyclePolicy";

const policy = new CrmLifecyclePolicy();

const money = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) ? amount : Number.NaN;
};

export function ProposalsPage() {
  const proposals = useListProposal();
  const clients = useListClient();
  const createProposal = useCreateProposal();
  const send = useProposalSend();
  const markViewed = useProposalMarkViewed();
  const accept = useProposalAccept();
  const decline = useProposalDecline();
  const expire = useProposalExpire();
  const [showDraft, setShowDraft] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeClients = (clients ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.registeredAt != null &&
      String(row.status) === "active",
  );
  const activeRows = (proposals ?? []).filter((row) => row.deletedAt == null);
  const visibleRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) =>
          !["accepted", "declined", "expired"].includes(String(row.status)),
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
    const clientId = String(data.get("clientId") || "").trim();
    const title = String(data.get("title") || "").trim();
    const subtotal = money(data.get("subtotal"));
    const taxAmount = money(data.get("taxAmount"));
    const discountAmount = money(data.get("discountAmount"));
    if (!clientId || !title) {
      setFailure(new Error("Client and title are required."));
      return;
    }
    if ([subtotal, taxAmount, discountAmount].some((n) => Number.isNaN(n))) {
      setFailure(new Error("Money fields must be valid numbers."));
      return;
    }
    const total = subtotal + taxAmount - discountAmount;
    if (total < 0) {
      setFailure(new Error("Total cannot be negative."));
      return;
    }
    void run("draft-proposal", async () => {
      await createProposal({
        clientId,
        title,
        subtotal,
        taxAmount,
        discountAmount,
        total,
        guestCount: Number(data.get("guestCount") || 0) || 0,
        eventType: String(data.get("eventType") || "").trim() || undefined,
        venueName: String(data.get("venueName") || "").trim() || undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
      });
      form.reset();
      setShowDraft(false);
      setNotice("Proposal drafted. Send it when ready for the client.");
    });
  };

  const invoke = (
    row: { _id: string; version: number; status: unknown },
    key: string,
  ) => {
    void (async () => {
      if (key === "accept") {
        const ok = await prompt.askConfirm({
          title: "Accept proposal",
          description:
            "Acceptance records the commercial win. Create or link the Event from Events afterward — Manifest does not mint one from ProposalAccepted.",
          confirmLabel: "Accept proposal",
        });
        if (!ok) return;
        void run(`${row._id}:accept`, async () => {
          await accept({ docId: row._id, version: row.version });
          setNotice(
            "Proposal accepted. Create the Event from Events if one is not linked yet.",
          );
        });
        return;
      }
      if (key === "decline") {
        const ok = await prompt.askConfirm({
          title: "Decline proposal",
          description: "Marks this offer as declined.",
          confirmLabel: "Decline",
          tone: "danger",
        });
        if (!ok) return;
        void run(`${row._id}:decline`, async () => {
          await decline({ docId: row._id, version: row.version });
          setNotice("Proposal declined.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        const args = { docId: row._id, version: row.version };
        if (key === "send") await send(args);
        if (key === "markViewed") await markViewed(args);
        if (key === "expire") await expire(args);
        setNotice(`Proposal updated (${key}).`);
      });
    })();
  };

  const loading = proposals === undefined || clients === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Proposals</p>
          <h1 className="display-title mt-2">Sales proposals</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Draft → send → accept/decline. Acceptance does not create an Event;
            finish planning in Events, then draft a Contract against that Event.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
          >
            {showTerminal ? "Hide closed" : "Show closed"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowDraft((value) => !value)}
          >
            {showDraft ? "Close form" : "Draft proposal"}
          </button>
        </div>
      </header>
      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showDraft ? (
        <form className="supply-form" onSubmit={submitDraft}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Draft</p>
              <h2>New proposal</h2>
            </div>
          </div>
          {activeClients.length === 0 ? (
            <p className="text-[13px] text-ink-2">
              No active clients.{" "}
              <Link className="text-link" to={CLIENTS_ROUTES.root}>
                Register a client
              </Link>{" "}
              first.
            </p>
          ) : (
            <>
              <label>
                Client
                <select name="clientId" required defaultValue="">
                  <option value="" disabled>
                    Select client
                  </option>
                  {activeClients.map((row) => (
                    <option key={row._id} value={row._id}>
                      {clientDisplayName(row._id, clients)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input name="title" required />
              </label>
              <label>
                Guest count
                <input
                  name="guestCount"
                  type="number"
                  min={0}
                  defaultValue={0}
                />
              </label>
              <label>
                Event type
                <input name="eventType" />
              </label>
              <label>
                Venue name
                <input name="venueName" />
              </label>
              <label>
                Subtotal
                <input
                  name="subtotal"
                  type="number"
                  step="0.01"
                  min={0}
                  required
                />
              </label>
              <label>
                Tax
                <input
                  name="taxAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={0}
                  required
                />
              </label>
              <label>
                Discount
                <input
                  name="discountAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={0}
                  required
                />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={2} />
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy === "draft-proposal"}
              >
                Draft proposal
              </button>
            </>
          )}
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Offers</p>
            <h2>Proposals</h2>
          </div>
          <span>{visibleRows.length}</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No open proposals.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row._id}>
                  <td>{row.title}</td>
                  <td>{clientDisplayName(row.clientId, clients)}</td>
                  <td>{Number(row.total ?? 0).toFixed(2)}</td>
                  <td>
                    <StatusChip status={String(row.status)} />
                  </td>
                  <td className="supply-row-actions">
                    {policy
                      .proposalActions(String(row.status))
                      .map((action) => (
                        <button
                          key={action.key}
                          className="btn btn-ghost"
                          type="button"
                          disabled={busy != null}
                          onClick={() => invoke(row, action.key)}
                        >
                          {action.label}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
