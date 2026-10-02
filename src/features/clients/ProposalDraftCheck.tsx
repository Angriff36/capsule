import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";

// PL-PROPOSAL-DRAFT (spec §7.1/§7.3): the office's view of a draft built from
// its event - which parts the event changed since, what is still missing, and
// one button to build it again. Staff edits survive a rebuild
// (convex/lib/proposalGenerate.ts). Never a guard: sending stays open.

const SECTION_LABEL: Record<string, string> = {
  event: "Event details",
  menu: "Menu",
  pricing: "Prices",
  terms: "Terms",
  venue: "Venue",
  service: "Service style",
  rentals: "Rentals and decor",
};

/** Build (or build again) the draft proposal for an event. */
export function useGenerateProposalDraft() {
  return useMutation(api.lib.proposalGenerate.generateProposalDraft);
}

export function ProposalDraftCheck({
  proposalId,
  onFailure,
  onNotice,
}: {
  proposalId: Id<"proposals">;
  onFailure: (error: unknown) => void;
  onNotice: (message: string) => void;
}) {
  const report = useQuery(api.lib.proposalDraftReport.getProposalDraftReport, {
    proposalId,
  });
  const generate = useGenerateProposalDraft();
  const [busy, setBusy] = useState(false);
  if (!report) return null;
  const stale = report.sections.filter((section) => section.stale);
  if (!report.generated && report.issues.length === 0) return null;

  const rebuild = async () => {
    if (!report.eventId) return;
    setBusy(true);
    try {
      const result = await generate({
        eventId: report.eventId as Id<"events">,
      });
      onNotice(
        result.changed
          ? "Proposal brought up to date with the event. Staff changes were kept."
          : "Proposal already matches the event.",
      );
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-2 rounded-sm border border-line-2 bg-panel p-3 text-sm"
      data-testid="proposal-draft-check"
    >
      {stale.length > 0 ? (
        <div>
          <p className="font-medium text-ink">Out of date with the event</p>
          <ul className="mt-1 space-y-0.5 text-warn">
            {stale.flatMap((section) =>
              section.staleReasons.map((reason) => (
                <li key={`${section.key}:${reason}`}>
                  {SECTION_LABEL[section.key] ?? section.key}: {reason}
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}
      {report.issues.length > 0 ? (
        <div className={stale.length > 0 ? "mt-2" : undefined}>
          <p className="font-medium text-ink">Still to add</p>
          <ul className="mt-1 space-y-0.5 text-ink-2">
            {report.issues.map((issue) => (
              <li key={`${issue.code}:${issue.recordIds.join(",")}`}>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.generated && report.eventId ? (
        <button
          className="btn btn-ghost mt-2"
          type="button"
          disabled={busy}
          onClick={() => void rebuild()}
        >
          {busy ? "Building..." : "Build again from event"}
        </button>
      ) : null}
    </div>
  );
}
