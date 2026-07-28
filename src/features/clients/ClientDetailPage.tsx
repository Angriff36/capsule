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
import { AttachmentsSection } from "../attachments/AttachmentsSection";
import { useTrackRecent } from "../../lib/recents";
import { formatDate } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  ErrorState,
  PageHeader,
  Section,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { FINANCE_ROUTES } from "../finance/financeRoutes";
import { ClientCommunicationPanel } from "./ClientCommunicationPanel";
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
  useTrackRecent(
    "Client",
    client ? clientDisplayName(client._id, [client]) : undefined,
  );
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
      <div className="space-y-4">
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

  const clientContacts = contacts.filter(
    (row) => row.deletedAt == null && row.clientId === client._id,
  );
  const activeContacts = clientContacts.filter(
    (row) => row.deletedAt == null && String(row.status) === "active",
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
  const profileLine = [
    formatStatusLabel(String(client.clientType)),
    client.email,
    client.phone,
    client.website,
    `Net ${Number(client.paymentTermsDays ?? 30)} terms`,
    client.registeredAt != null
      ? `Client since ${formatDate(Number(client.registeredAt))}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {name}
            <StatusChip status={String(client.status)} />
          </span>
        }
        lead={
          <span className="text-[13px]">
            {profileLine}
            {" · "}
            <Link className="text-link" to={CLIENTS_ROUTES.root}>
              All clients
            </Link>
          </span>
        }
        actions={
          <>
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
              {showContact ? "Close" : "Add contact"}
            </button>
          </>
        }
      />
      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      <Section title="Proposals & contracts" count={clientProposals.length}>
        <p className="px-3 py-3 text-[13px] text-ink-2">
          {clientProposals.length} proposal
          {clientProposals.length === 1 ? "" : "s"} · {clientContracts.length}{" "}
          contract{clientContracts.length === 1 ? "" : "s"} for this client.
          Open{" "}
          <Link className="text-link" to={CLIENTS_ROUTES.proposals}>
            Proposals
          </Link>{" "}
          or{" "}
          <Link className="text-link" to={CLIENTS_ROUTES.contracts}>
            Contracts
          </Link>{" "}
          to send, accept, or sign.
        </p>
      </Section>

      <Section title="Invoices" count={clientInvoices.length}>
        {clientInvoices.length === 0 ? (
          <p className="px-3 py-3 text-[13px] text-ink-2">
            No invoices yet.{" "}
            <Link
              className="text-link"
              to={FINANCE_ROUTES.issueInvoice({ clientId: client._id })}
            >
              Issue an invoice
            </Link>{" "}
            for this client.
          </p>
        ) : (
          <p className="px-3 py-3 text-[13px] text-ink-2">
            {clientInvoices.length} invoice
            {clientInvoices.length === 1 ? "" : "s"} — see them in the{" "}
            <Link
              className="text-link"
              to={`${FINANCE_ROUTES.invoices}?clientId=${encodeURIComponent(client._id)}`}
            >
              billing ledger
            </Link>
            .
          </p>
        )}
      </Section>

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

      <ClientCommunicationPanel
        target={{ kind: "contacts", contacts: clientContacts }}
      />

      <form className="supply-form" onSubmit={submitAccountContact}>
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>Contact details</h2>
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
          Save contact details
        </button>
      </form>

      <AttachmentsSection parentType="client" parentId={client._id} />
    </div>
  );
}
