import { useState, type FormEvent } from "react";
import { useProposalReviseDraft } from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";

interface ProposalTermsPanelProps {
  proposal: {
    _id: string;
    version: number;
    title: string;
    terms?: string | null;
    notes?: string | null;
    expiresAt?: number | null;
  };
  editable: boolean;
  onFailure: (error: Error) => void;
  onNotice: (message: string) => void;
}

const dateInput = (at?: number | null) =>
  at ? new Date(at).toLocaleDateString("en-CA") : "";

/**
 * The words the client reads: title, terms, notes and the valid-until date.
 * A draft can be changed here before it is sent; after that they are shown
 * as sent.
 */
export function ProposalTermsPanel({
  proposal,
  editable,
  onFailure,
  onNotice,
}: ProposalTermsPanelProps) {
  const revise = useProposalReviseDraft();
  const [busy, setBusy] = useState(false);

  if (!editable) {
    return (
      <div className="mt-3 rounded-sm border border-line bg-inset p-4">
        <p className="eyebrow">Terms</p>
        <p className="mt-1 whitespace-pre-wrap text-base text-ink">
          {proposal.terms?.trim() || "No terms on this proposal."}
        </p>
        {proposal.expiresAt ? (
          <p className="mt-2 text-sm text-ink-2">
            Valid until {formatDate(proposal.expiresAt)}
          </p>
        ) : null}
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = String(data.get(name) ?? "").trim();
      return value || undefined;
    };
    const until = text("expiresAt");
    setBusy(true);
    try {
      await revise({
        docId: proposal._id,
        version: proposal.version,
        title: text("title") ?? "",
        terms: text("terms"),
        notes: text("notes"),
        // Noon local, so the day shown is the day picked.
        expiresAt: until ? new Date(`${until}T12:00:00`).getTime() : undefined,
      });
      onNotice("Proposal wording saved.");
    } catch (error) {
      onFailure(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      key={proposal.version}
      className="mt-3 grid gap-3 rounded-sm border border-line bg-inset p-4"
      onSubmit={(event) => void submit(event)}
    >
      <p className="eyebrow">Title, terms and notes</p>
      <label className="field-label">
        Title
        <input
          className="input"
          name="title"
          required
          defaultValue={proposal.title}
        />
      </label>
      <label className="field-label">
        Terms the client agrees to
        <textarea
          className="input"
          name="terms"
          rows={4}
          defaultValue={proposal.terms ?? ""}
        />
      </label>
      <label className="field-label">
        Notes for the client
        <textarea
          className="input"
          name="notes"
          rows={2}
          defaultValue={proposal.notes ?? ""}
        />
      </label>
      <label className="field-label">
        Valid until
        <input
          className="input"
          type="date"
          name="expiresAt"
          defaultValue={dateInput(proposal.expiresAt)}
        />
      </label>
      <div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save wording"}
        </button>
      </div>
    </form>
  );
}
