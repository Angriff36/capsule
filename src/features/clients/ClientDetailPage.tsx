import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useClientArchive,
  useClientChangeContact,
  useClientContactRemove,
  useClientContactSetPrimary,
  useClientReactivate,
  useCreateClientContact,
  useGetClient,
  useListClientContact,
  useListContract,
  useListInvoice,
  useListProposal,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { ErrorState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { FINANCE_ROUTES } from "../finance/financeRoutes";
import { ClientContactsPanel } from "./ClientContactsPanel";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { CrmLifecyclePolicy } from "./CrmLifecyclePolicy";

const policy = new CrmLifecyclePolicy();

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useGetClient(id ?? "skip");
  const contacts = useListClientContact();
  const proposals = useListProposal();
  const contracts = useListContract();
  const invoices = useListInvoice();
  const createContact = useCreateClientContact();
  const setPrimary = useClientContactSetPrimary();
  const removeContact = useClientContactRemove();
  const changeContact = useClientChangeContact();
  const archive = useClientArchive();
  const reactivate = useClientReactivate();
  const [showContact, setShowContact] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  if (!id) {
    return (
      <ErrorState
        title="Client not found"
        detail="The address is missing a client id."
      />
    );
  }

  if (
    client === undefined ||
    contacts === undefined ||
    proposals === undefined ||
    contracts === undefined ||
    invoices === undefined
  ) {
    return (
      <div className="operations-stage supply-stage">
        <ClientsWorkspaceNav />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (client === null) {
    return (
      <ErrorState
        title="Client not found"
        detail="This client is missing or belongs to another tenant."
      />
    );
  }

  const activeContacts = contacts.filter(
    (row) =>
      row.deletedAt == null &&
      row.clientId === client._id &&
      String(row.status) === "active",
  );
  const clientProposals = proposals.filter(
    (row) => row.deletedAt == null && row.clientId === client._id,
  );
  const clientContracts = contracts.filter(
    (row) => row.deletedAt == null && row.clientId === client._id,
  );
  const clientInvoices = invoices.filter(
    (row) => row.deletedAt == null && String(row.clientId) === client._id,
  );
  const actions = policy.clientActions(String(client.status));

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

  const submitContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const givenName = String(data.get("givenName") || "").trim();
    if (!givenName) {
      setFailure(new Error("Contact given name is required."));
      return;
    }
    void run("add-contact", async () => {
      await createContact({
        clientId: client._id,
        givenName,
        familyName: optional(String(data.get("familyName") ?? "")),
        title: optional(String(data.get("title") ?? "")),
        email: optional(String(data.get("email") ?? "")),
        phone: optional(String(data.get("phone") ?? "")),
        isPrimary: data.get("isPrimary") === "on",
        isBillingContact: data.get("isBillingContact") === "on",
        notes: optional(String(data.get("notes") ?? "")),
      });
      form.reset();
      setShowContact(false);
      setNotice("Contact added.");
    });
  };

  const submitAccountContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run("change-contact", async () => {
      await changeContact({
        docId: client._id,
        version: client.version,
        email: optional(String(data.get("email") ?? "")),
        phone: optional(String(data.get("phone") ?? "")),
        website: optional(String(data.get("website") ?? "")),
      });
      setNotice("Account contact details updated.");
    });
  };

  const invokeClient = (key: string) => {
    void (async () => {
      if (key === "archive") {
        const reason = await prompt.askReason({
          ...ReasonCopy.archiveClient,
          tone: "danger",
        });
        if (!reason) return;
        void run("archive", async () => {
          await archive({
            docId: client._id,
            version: client.version,
            reason,
          });
          setNotice("Client archived.");
        });
        return;
      }
      if (key === "reactivate") {
        void run("reactivate", async () => {
          await reactivate({ docId: client._id, version: client.version });
          setNotice("Client reactivated.");
        });
      }
    })();
  };

  const name = clientDisplayName(client._id, [client]);

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Account</p>
          <h1 className="display-title mt-2">{name}</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Contacts, proposals, and contracts for this account. After accepting
            a proposal, create or link the Event from Events — acceptance does
            not mint one automatically.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip status={String(client.status)} />
            <Link className="text-link text-[13px]" to={CLIENTS_ROUTES.root}>
              ← All clients
            </Link>
          </div>
        </div>
        <div className="supply-row-actions">
          {actions.map((action) => (
            <button
              key={action.key}
              className="btn btn-ghost"
              type="button"
              disabled={busy != null}
              onClick={() => invokeClient(action.key)}
            >
              {action.label}
            </button>
          ))}
          <Link
            className="btn btn-ghost"
            to={FINANCE_ROUTES.issueInvoice({ clientId: client._id })}
          >
            Issue invoice
          </Link>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowContact((value) => !value)}
          >
            {showContact ? "Close form" : "Add contact"}
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

      <form className="supply-form" onSubmit={submitAccountContact}>
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Account</p>
            <h2>Primary contact channels</h2>
          </div>
        </div>
        <label>
          Email
          <input name="email" type="email" defaultValue={client.email ?? ""} />
        </label>
        <label>
          Phone
          <input name="phone" defaultValue={client.phone ?? ""} />
        </label>
        <label>
          Website
          <input name="website" defaultValue={client.website ?? ""} />
        </label>
        <button
          className="btn btn-ghost"
          type="submit"
          disabled={
            busy === "change-contact" || String(client.status) !== "active"
          }
        >
          Save account contact
        </button>
      </form>

      <ClientContactsPanel
        showAddForm={showContact}
        busy={busy}
        contacts={activeContacts}
        onSubmitAdd={submitContact}
        askConfirm={(request) => prompt.askConfirm(request)}
        onSetPrimary={(row) =>
          void run(`${row._id}:primary`, async () => {
            await setPrimary({ docId: row._id, version: row.version });
            setNotice("Primary contact updated.");
          })
        }
        onRemove={(row) =>
          void run(`${row._id}:remove`, async () => {
            await removeContact({ docId: row._id, version: row.version });
            setNotice("Contact removed.");
          })
        }
      />

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h2>Proposals & contracts</h2>
          </div>
        </div>
        <p className="text-[13px] text-ink-2">
          {clientProposals.length} proposals · {clientContracts.length}{" "}
          contracts — manage lifecycle on{" "}
          <Link className="text-link" to={CLIENTS_ROUTES.proposals}>
            Proposals
          </Link>{" "}
          /{" "}
          <Link className="text-link" to={CLIENTS_ROUTES.contracts}>
            Contracts
          </Link>
          .
        </p>
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Billing</p>
            <h2>Invoices</h2>
          </div>
          <span>{clientInvoices.length}</span>
        </div>
        {clientInvoices.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            No invoices yet.{" "}
            <Link
              className="text-link"
              to={FINANCE_ROUTES.issueInvoice({ clientId: client._id })}
            >
              Issue an invoice
            </Link>{" "}
            for this account.
          </p>
        ) : (
          <p className="text-[13px] text-ink-2">
            {clientInvoices.length} invoice
            {clientInvoices.length === 1 ? "" : "s"} — open the{" "}
            <Link
              className="text-link"
              to={`${FINANCE_ROUTES.invoices}?clientId=${encodeURIComponent(client._id)}`}
            >
              finance ledger
            </Link>{" "}
            filtered to this client.
          </p>
        )}
      </section>
    </div>
  );
}
