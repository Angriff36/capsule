import {
  useStartProposalChange,
  type StartProposalChangeResult,
} from "./useStartProposalChange";
import type { Id } from "../../lib/api";

function changeNotice(
  result: StartProposalChangeResult,
  accepted: boolean,
): string {
  if (result.alreadyStarted) {
    return accepted
      ? "A change draft is already open for this proposal."
      : "A new version is already open as a draft.";
  }
  const kept = accepted
    ? "A change draft is ready. The accepted proposal is unchanged."
    : "A new version is ready as a draft. The client keeps the sent proposal until you send the new version, which then replaces it.";
  if (result.leftOffDishNames.length === 0) return kept;
  const names = result.leftOffDishNames.join(", ");
  return `${kept} These dishes were left off because they are no longer available: ${names}.`;
}

/**
 * One click on an accepted proposal opens an editable draft; the accepted
 * proposal stays accepted. On a sent proposal it opens the next version as a
 * draft; sending that version replaces the sent one (AC-256).
 */
export function ProposalChangeAction({
  proposalId,
  busy,
  run,
  onNotice,
  accepted = true,
}: Readonly<{
  proposalId: Id<"proposals">;
  accepted?: boolean;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
  onNotice: (message: string) => void;
}>) {
  const start = useStartProposalChange();
  const key = `${proposalId}:start-change`;
  return (
    <button
      className="btn btn-ghost"
      type="button"
      disabled={busy != null}
      onClick={() => {
        void run(key, async () => {
          const result = await start({ proposalId });
          onNotice(changeNotice(result, accepted));
        });
      }}
    >
      {accepted ? "Start a change" : "Revise"}
    </button>
  );
}
