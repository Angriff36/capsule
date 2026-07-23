import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateClient,
  useCreateClientMerge,
  useListClient,
  useListClientCommunication,
  useListClientContact,
  useListEvent,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ClientDuplicateReview } from "./ClientDuplicateReview";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import {
  findProbableClientDuplicates,
  type ClientDuplicateCandidate,
} from "./contactDedup";
import { CrmFailureBanner } from "./CrmFailureBanner";

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function ClientsPage() {
  const clients = useListClient();
  const contacts = useListClientContact();
  const events = useListEvent();
  const communications = useListClientCommunication();
  const createClient = useCreateClient();
  const createClientMerge = useCreateClientMerge();
  const [showRegister, setShowRegister] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [clientType, setClientType] = useState<"company" | "person">("company");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy);

  const registered = (clients ?? []).filter(
    (row) => row.deletedAt == null && row.registeredAt != null,
  );
  const visible = showArchived
    ? registered
    : registered.filter((row) => String(row.status) !== "archived");
  const duplicateCandidates = useMemo(
    () => findProbableClientDuplicates(clients ?? []),
    [clients],
  );

  const reviewCandidate = (candidate: ClientDuplicateCandidate) => {
    setSelectedCandidateId(candidate.id);
    setPrimaryClientId(String(candidate.first._id));
  };

  const countsFor = (clientId: string) => {
    const allClientContacts = (contacts ?? []).filter(
      (contact) => String(contact.clientId) === clientId,
    );
    const allClientEvents = (events ?? []).filter(
      (clientEvent) => String(clientEvent.clientId) === clientId,
    );
    const clientContacts = allClientContacts.filter(
      (contact) => contact.deletedAt == null,
    );
    const clientEvents = allClientEvents.filter(
      (clientEvent) => clientEvent.deletedAt == null,
    );
    const contactIds = new Set(allClientContacts.map((contact) => contact._id));
    const eventIds = new Set(
      allClientEvents.map((clientEvent) => clientEvent._id),
    );
    const communicationCount = (communications ?? []).filter(
      (communication) =>
        (communication.clientContactId != null &&
          contactIds.has(communication.clientContactId)) ||
        (communication.eventId != null && eventIds.has(communication.eventId)),
    ).length;
    return {
      contacts: clientContacts.length,
      events: clientEvents.length,
      communications: communicationCount,
    };
  };

  const mergeSelected = () => {
    const candidate = duplicateCandidates.find(
      (item) => item.id === selectedCandidateId,
    );
    if (!candidate || !primaryClientId) return;
    const duplicateClientId =
      String(candidate.first._id) === primaryClientId
        ? String(candidate.second._id)
        : String(candidate.first._id);
    const primary =
      String(candidate.first._id) === primaryClientId
        ? candidate.first
        : candidate.second;
    const duplicate =
      primary === candidate.first ? candidate.second : candidate.first;

    void (async () => {
      const confirmed = await prompt.askConfirm({
        title: "Merge duplicate client?",
        description: `${clientDisplayName(duplicate._id, [duplicate])}'s events, contacts, communication, commercial, and billing history will move to ${clientDisplayName(primary._id, [primary])}. The duplicate account will be soft-deleted.`,
        confirmLabel: "Merge client",
        tone: "danger",
      });
      if (!confirmed) return;

      setFailure(null);
      setNotice(null);
      setBusy(true);
      try {
        await createClientMerge({
          primaryClientId,
          duplicateClientId,
        });
        setSelectedCandidateId(null);
        setPrimaryClientId(null);
        setNotice(
          "Duplicate merged. Events and communication history now appear on the primary client.",
        );
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const submitRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = String(data.get("clientType") || clientType) as
      "company" | "person";
    setFailure(null);
    setNotice(null);
    setBusy(true);
    void (async () => {
      try {
        const created = await createClient({
          clientType: type,
          companyName: optional(String(data.get("companyName") ?? "")),
          givenName: optional(String(data.get("givenName") ?? "")),
          familyName: optional(String(data.get("familyName") ?? "")),
          email: optional(String(data.get("email") ?? "")),
          phone: optional(String(data.get("phone") ?? "")),
          paymentTermsDays: Number(data.get("paymentTermsDays") || 30) || 30,
          taxExempt: data.get("taxExempt") === "on",
          notes: optional(String(data.get("notes") ?? "")),
        });
        form.reset();
        setShowRegister(false);
        setClientType("company");
        setNotice(
          created?.docId
            ? "Client registered. Open the account to add contacts or draft a proposal."
            : "Client registered.",
        );
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Accounts</p>
          <h1 className="display-title mt-2">Client accounts</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Register a client, manage contacts, then draft proposals and
            contracts. Event creation after proposal acceptance stays a separate
            Events step.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowRegister((value) => !value)}
          >
            {showRegister ? "Close form" : "Register client"}
          </button>
        </div>
      </header>
      <ClientsWorkspaceNav />
      {host}
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {showRegister ? (
        <form className="supply-form" onSubmit={submitRegister}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Register</p>
              <h2>New client</h2>
            </div>
          </div>
          <label>
            Type
            <select
              name="clientType"
              value={clientType}
              onChange={(event) =>
                setClientType(event.target.value as "company" | "person")
              }
            >
              <option value="company">Company</option>
              <option value="person">Person</option>
            </select>
          </label>
          {clientType === "company" ? (
            <label>
              Company name
              <input name="companyName" required />
            </label>
          ) : (
            <>
              <label>
                Given name
                <input name="givenName" required />
              </label>
              <label>
                Family name
                <input name="familyName" />
              </label>
            </>
          )}
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Phone
            <input name="phone" />
          </label>
          <label>
            Payment terms (days)
            <input
              name="paymentTermsDays"
              type="number"
              min={0}
              max={365}
              defaultValue={30}
            />
          </label>
          <label className="supply-check">
            <input name="taxExempt" type="checkbox" /> Tax exempt
          </label>
          <label>
            Notes
            <textarea name="notes" rows={2} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Registering…" : "Register client"}
          </button>
        </form>
      ) : null}

      {clients !== undefined &&
      contacts !== undefined &&
      events !== undefined &&
      communications !== undefined ? (
        <ClientDuplicateReview
          candidates={duplicateCandidates}
          selectedCandidateId={selectedCandidateId}
          primaryClientId={primaryClientId}
          busy={busy}
          countsFor={countsFor}
          onReview={reviewCandidate}
          onChoosePrimary={setPrimaryClientId}
          onCancel={() => {
            setSelectedCandidateId(null);
            setPrimaryClientId(null);
          }}
          onMerge={mergeSelected}
        />
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Accounts</p>
            <h2>Clients</h2>
          </div>
          <span>{visible.length} clients</span>
        </div>
        {clients === undefined ? (
          <TableSkeleton rows={5} />
        ) : visible.length === 0 ? (
          <div className="document-empty">
            <p>No client accounts yet.</p>
            <span>Register a client to start proposals and contracts.</span>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Terms</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row._id}>
                  <td>
                    <Link
                      className="text-link"
                      to={CLIENTS_ROUTES.detail(row._id)}
                    >
                      {clientDisplayName(row._id, clients)}
                    </Link>
                  </td>
                  <td>{String(row.clientType)}</td>
                  <td>
                    <StatusChip status={String(row.status)} />
                  </td>
                  <td>{Number(row.paymentTermsDays ?? 30)} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
