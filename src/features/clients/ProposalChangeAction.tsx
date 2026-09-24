import { useStartProposalChange } from "./useStartProposalChange";
import type { Id } from "../../lib/api";

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
          onNotice(
            result.alreadyStarted
              ? "A change draft is already open for this proposal."
              : "A change draft is ready. The accepted proposal is unchanged.",
          );
        });
      }}
    >
      Start a change
    </button>
  );
}
