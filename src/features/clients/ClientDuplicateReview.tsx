import type { Doc } from "../../lib/api";
import { clientDisplayName } from "../events/clientName";
import type { ClientDuplicateCandidate } from "./contactDedup";

interface TransferCounts {
  contacts: number;
  events: number;
  communications: number;
}

interface ClientDuplicateReviewProps {
  candidates: ClientDuplicateCandidate[];
  selectedCandidateId: string | null;
  primaryClientId: string | null;
  busy: boolean;
  countsFor: (clientId: string) => TransferCounts;
  onReview: (candidate: ClientDuplicateCandidate) => void;
  onChoosePrimary: (clientId: string) => void;
  onCancel: () => void;
  onMerge: () => void;
}

function AccountChoice({
  client,
  selected,
  counts,
  onChoose,
}: {
  client: Doc<"clients">;
  selected: boolean;
  counts: TransferCounts;
  onChoose: () => void;
}) {
  return (
    <label
      className={`card cursor-pointer border p-4 transition ${
        selected ? "border-accent bg-accent-soft" : "border-line"
      }`}
    >
      <span className="flex items-start gap-3">
        <input
          type="radio"
          name="primaryClient"
          checked={selected}
          onChange={onChoose}
        />
        <span>
          <strong className="block text-ink">
            {clientDisplayName(client._id, [client])}
          </strong>
          <span className="mt-1 block text-[13px] text-ink-2">
            {client.email || "No email"}
          </span>
          <span className="mt-3 block text-[12px] text-ink-2">
            {counts.events} events · {counts.contacts} contacts ·{" "}
            {counts.communications} communications
          </span>
        </span>
      </span>
      <span className="mt-3 block text-[12px] font-semibold uppercase tracking-wide text-ink-2">
        {selected ? "Keep as primary" : "Merge this duplicate"}
      </span>
    </label>
  );
}

export function ClientDuplicateReview({
  candidates,
  selectedCandidateId,
  primaryClientId,
  busy,
  countsFor,
  onReview,
  onChoosePrimary,
  onCancel,
  onMerge,
}: ClientDuplicateReviewProps) {
  if (candidates.length === 0) return null;

  const selected = candidates.find(
    (candidate) => candidate.id === selectedCandidateId,
  );
  const duplicate = selected
    ? selected.first._id === primaryClientId
      ? selected.second
      : selected.first
    : null;
  const primary = selected
    ? selected.first._id === primaryClientId
      ? selected.first
      : selected.second
    : null;

  return (
    <section
      className="working-ledger border-warn/40 bg-warn-soft/20"
      data-testid="duplicate-client-review"
    >
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Housekeeping</p>
          <h2>Possible duplicate clients</h2>
        </div>
        <span>{candidates.length} to review</span>
      </div>
      <p className="max-w-180 text-[13px] text-ink-2">
        These pairs look like the same client entered twice. Review both before
        merging — everything from the duplicate moves to the client you keep.
      </p>

      {!selected ? (
        <div className="mt-4 grid gap-3">
          {candidates.map((candidate) => (
            <article
              key={candidate.id}
              className="card flex flex-wrap items-center justify-between gap-4 border-line p-4"
            >
              <div>
                <strong>
                  {clientDisplayName(candidate.first._id, [candidate.first])}
                  {" ↔ "}
                  {clientDisplayName(candidate.second._id, [candidate.second])}
                </strong>
                <p className="mt-1 text-[12px] text-ink-2">
                  {candidate.reasons.join(" · ")} ·{" "}
                  {Math.round(candidate.confidence * 100)}% confidence
                </p>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => onReview(candidate)}
              >
                Review merge
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4" data-testid="client-merge-comparison">
          <div className="grid gap-3 md:grid-cols-2">
            <AccountChoice
              client={selected.first}
              selected={selected.first._id === primaryClientId}
              counts={countsFor(String(selected.first._id))}
              onChoose={() => onChoosePrimary(String(selected.first._id))}
            />
            <AccountChoice
              client={selected.second}
              selected={selected.second._id === primaryClientId}
              counts={countsFor(String(selected.second._id))}
              onChoose={() => onChoosePrimary(String(selected.second._id))}
            />
          </div>
          <p className="mt-4 text-[13px] text-ink-2">
            {duplicate && primary
              ? `Everything on ${clientDisplayName(duplicate._id, [duplicate])} — events, contacts, conversations, and billing — will move to ${clientDisplayName(primary._id, [primary])}. The duplicate goes away.`
              : "Choose which client to keep."}
          </p>
          <div className="supply-row-actions mt-4">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !primaryClientId}
              onClick={onMerge}
            >
              {busy ? "Merging…" : "Merge duplicate"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
