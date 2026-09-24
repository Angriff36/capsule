import {
  useStartProposalChange,
  type StartProposalChangeResult,
} from "./useStartProposalChange";
import type { Id } from "../../lib/api";

function changeNotice(result: StartProposalChangeResult): string {
  if (result.alreadyStarted) {
    return "A change draft is already open for this proposal.";
  }
  if (result.leftOffDishNames.length === 0) {
    return "A change draft is ready. The accepted proposal is unchanged.";
  }
  const names = result.leftOffDishNames.join(", ");
  return `A change draft is ready. The accepted proposal is unchanged. These dishes were left off because they are no longer available: ${names}.`;
}

/**
 * One click on an accepted proposal opens an editable draft. The accepted
 * proposal stays accepted.
 */
export function ProposalChangeAction({
  proposalId,
  busy,
  run,
  onNotice,
}: Readonly<{
  proposalId: Id<"proposals">;
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
          onNotice(changeNotice(result));
        });
      }}
    >
      Start a change
    </button>
  );
}
