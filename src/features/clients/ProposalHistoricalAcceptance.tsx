import { useMutation } from "convex/react";
import { api, type Id } from "../../lib/api";
import type { ActionPromptSession } from "../../ui/action-prompt";

/**
 * AC-098: an event brought in from another system that the client already
 * agreed to. One press builds the proposal from the event, publishes it and
 * records the acceptance with where it came from - never as a signature.
 * Authored seam: convex/lib/proposalHistoricalAcceptance.ts.
 */
export function RecordAcceptedBeforeCapsule({
  event,
  prompt,
  busy,
  run,
  onNotice,
  onOpen,
}: Readonly<{
  event: {
    _id: Id<"events">;
    eventNumber?: string | null;
    importSourceKey?: string | null;
  };
  prompt: ActionPromptSession;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
  onNotice: (message: string) => void;
  onOpen: (proposalId: Id<"proposals">) => void;
}>) {
  const record = useMutation(
    api.lib.proposalHistoricalAcceptance.recordImportedAcceptance,
  );
  const ask = async () => {
    const values = await prompt.askFields({
      title: "Accepted before Capsule",
      description:
        "Use this when the client agreed to this event before it came into Capsule. Capsule builds the proposal from the event, keeps a copy of it, and marks it accepted. It does not make a signature.",
      fields: [
        {
          name: "source",
          label: "Where the acceptance came from",
          defaultValue: event.importSourceKey ? "The old booking system" : "",
          placeholder: "For example: the old booking system",
          required: true,
        },
        {
          name: "evidence",
          label: "What shows the client agreed",
          defaultValue: event.eventNumber ? `Invoice ${event.eventNumber}` : "",
          placeholder: "For example: invoice 6014, signed paper on file",
          required: true,
        },
      ],
      confirmLabel: "Mark accepted",
    });
    if (!values) return;
    void run("accepted-before-capsule", async () => {
      const result = await record({
        eventId: event._id,
        source: values.source ?? "",
        evidence: values.evidence ?? "",
      });
      onNotice(
        "Proposal marked accepted before Capsule. No signature was made.",
      );
      onOpen(result.proposalId);
    });
  };
  return (
    <button
      className="btn btn-ghost"
      type="button"
      disabled={busy != null}
      onClick={() => void ask()}
    >
      Accepted before Capsule
    </button>
  );
}

/** Shown on an accepted proposal whose acceptance came from before Capsule. */
export function HistoricalAcceptanceLabel({
  source,
  evidence,
}: Readonly<{
  source?: string | null;
  evidence?: string | null;
}>) {
  if (!source) return null;
  return (
    <p className="mt-1 text-base text-ink-2">
      Accepted before Capsule (from {source}
      {evidence ? `: ${evidence}` : ""})
    </p>
  );
}
