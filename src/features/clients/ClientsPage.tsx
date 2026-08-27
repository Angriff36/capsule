import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCreateClient,
  useCreateClientMerge,
  useListClient,
  useListClientCommunication,
  useListClientContact,
  useListEvent,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { formatDate, formatMoney } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  EmptyState,
  PageHeader,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ClientDuplicateReview } from "./ClientDuplicateReview";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import {
  findProbableClientDuplicates,
  type ClientDuplicateCandidate,
} from "./contactDedup";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { useActionNotice } from "../../ui/action-result";

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Per-client booking rollup derived from the events the page already loads. */
interface ClientEventStats {
  upcoming: number;
  lastPastAt: number;
  lifetimeValue: number;
}

const EMPTY_STATS: ClientEventStats = {
  upcoming: 0,
  lastPastAt: 0,
  lifetimeValue: 0,
};

export function ClientsPage() {
  const navigate = useNavigate();
  const clients = useListClient();
  const contacts = useListClientContact();
  const events = useListEvent();
  const communications = useListClientCommunication();
  const createClient = useCreateClient();
  const createClientMerge = useCreateClientMerge();
  const [showRegister, setShowRegister] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [clientType, setClientType] = useState<"company" | "person">("company");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy);

  const registered = (clients ?? []).filter(
    (row) => row.deletedAt == null && row.registeredAt != null,
  );
  const duplicateCandidates = useMemo(
    () => findProbableClientDuplicates(clients ?? []),
    [clients],
  );

  const statsByClient = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, ClientEventStats>();
    for (const row of events ?? []) {
      if (row.deletedAt != null) continue;
      const clientId = String(row.clientId);
      const stats = map.get(clientId) ?? { ...EMPTY_STATS };
      if (String(row.stage) !== "cancelled") {
        stats.lifetimeValue += Number(row.quotedPrice ?? 0);
      }
      const startsAt = Number(row.startsAt ?? 0);
      if (startsAt > now) {
        stats.upcoming += 1;
      } else if (startsAt > 0) {
        stats.lastPastAt = Math.max(stats.lastPastAt, startsAt);
      }
      map.set(clientId, stats);
    }
    return map;
  }, [events]);

  const visible = useMemo(() => {
    const list = showArchived
      ? registered
      : registered.filter((row) => String(row.status) !== "archived");
    return [...list].sort((a, b) => {
      const aStats = statsByClient.get(String(a._id)) ?? EMPTY_STATS;
      const bStats = statsByClient.get(String(b._id)) ?? EMPTY_STATS;
      if (bStats.upcoming !== aStats.upcoming)
        return bStats.upcoming - aStats.upcoming;
      if (bStats.lifetimeValue !== aStats.lifetimeValue)
        return bStats.lifetimeValue - aStats.lifetimeValue;
      return clientDisplayName(a._id, [a]).localeCompare(
        clientDisplayName(b._id, [b]),
      );
    });
  }, [registered, showArchived, statsByClient]);

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
        description: `Everything on ${clientDisplayName(duplicate._id, [duplicate])} — events, contacts, conversations, and billing — will move to ${clientDisplayName(primary._id, [primary])}. The duplicate goes away.`,
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
          "Duplicates merged. Their events and conversation history now live on the client you kept.",
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
            ? "Client added. Open them to add contacts or start a proposal."
            : "Client added.",
        );
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const dataLoaded =
    clients !== undefined &&
    contacts !== undefined &&
    events !== undefined &&
    communications !== undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        lead="Everyone you cook for — who they are, what's coming up, and what they're worth."
        actions={[
          <button
            key="archived"
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>,
          <button
            key="add"
            className="btn btn-primary"
            type="button"
            onClick={() => setShowRegister((value) => !value)}
          >
            {showRegister ? "Close" : "Add client"}
          </button>,
        ]}
      />
      <ClientsWorkspaceNav />
      {host}
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {dataLoaded && duplicateCandidates.length > 0 ? (
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <span className="chip border-warn/30 bg-warn-soft text-warn">
            {duplicateCandidates.length} possible duplicate
            {duplicateCandidates.length === 1 ? "" : "s"}
          </span>
          <button
            className="text-link cursor-pointer"
            type="button"
            onClick={() => setShowDuplicates((value) => !value)}
          >
            {showDuplicates ? "Hide" : "Review"}
          </button>
        </div>
      ) : null}

      {showRegister ? (
        <form className="supply-form" onSubmit={submitRegister}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New</p>
              <h2>Add a client</h2>
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
              className="input"
            >
              <option value="company">Company</option>
              <option value="person">Person</option>
            </select>
          </label>
          {clientType === "company" ? (
            <label>
              Company name
              <input name="companyName" required className="input" />
            </label>
          ) : (
            <>
              <label>
                First name
                <input name="givenName" required className="input" />
              </label>
              <label>
                Last name
                <input name="familyName" className="input" />
              </label>
            </>
          )}
          <label>
            Email
            <input name="email" type="email" className="input" />
          </label>
          <label>
            Phone
            <input name="phone" className="input" />
          </label>
          <label>
            Payment terms (days)
            <input
              name="paymentTermsDays"
              type="number"
              min={0}
              max={365}
              defaultValue={30}
              className="input"
            />
          </label>
          <label className="supply-check">
            <input name="taxExempt" type="checkbox" /> Tax exempt
          </label>
          <label>
            Notes
            <textarea name="notes" rows={2} className="input" />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save client"}
          </button>
        </form>
      ) : null}

      {dataLoaded && showDuplicates ? (
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

      <div className="card overflow-x-auto">
        {clients === undefined ? (
          <TableSkeleton rows={5} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No clients yet"
            hint="Add your first client to start sending proposals."
            action={
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setShowRegister(true)}
              >
                Add client
              </button>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th w-full">Client</th>
                <th className="th">Contact</th>
                <th className="th text-right">Upcoming</th>
                <th className="th">Last event</th>
                <th className="th text-right">Lifetime value</th>
                <th className="th">Status</th>
                <th className="th">Terms</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const stats = statsByClient.get(String(row._id)) ?? EMPTY_STATS;
                const contactLine = [row.email, row.phone]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr
                    key={row._id}
                    onClick={() => navigate(CLIENTS_ROUTES.detail(row._id))}
                    className="cursor-pointer transition-colors hover:bg-inset/60"
                  >
                    <td className="td w-full max-w-0 truncate">
                      <span className="font-medium">
                        {clientDisplayName(row._id, clients)}
                      </span>
                      <span className="ml-2 text-sm text-ink-3">
                        {formatStatusLabel(String(row.clientType))}
                      </span>
                    </td>
                    <td className="td text-sm text-ink-3">
                      {contactLine || "—"}
                    </td>
                    <td className="td text-right font-mono">
                      {stats.upcoming > 0 ? stats.upcoming : "—"}
                    </td>
                    <td className="td font-mono text-sm">
                      {stats.lastPastAt > 0
                        ? formatDate(stats.lastPastAt)
                        : "—"}
                    </td>
                    <td className="td text-right font-mono">
                      {stats.lifetimeValue > 0
                        ? formatMoney(stats.lifetimeValue)
                        : "—"}
                    </td>
                    <td className="td">
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td className="td text-sm text-ink-2">
                      {Number(row.paymentTermsDays ?? 30)} days
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
