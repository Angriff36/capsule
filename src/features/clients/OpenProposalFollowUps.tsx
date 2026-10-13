import { useNavigate } from "react-router-dom";
import { useRowsInStatuses } from "../../lib/financeScopedQueries";
import { useClientsByIds } from "../../lib/useClientDirectory";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ProposalFollowUps } from "./ProposalFollowUps";
import { SalesHabits } from "./SalesHabits";

const OPEN_STATUSES = ["draft", "sent", "viewed"];

/**
 * Every open proposal's follow-up step and the team's sales habits, for the
 * sales Pipeline. Proposals
 * live on their event, so this queue is the one company-wide view of them.
 */
export function OpenProposalFollowUps({
  onNotice,
  onFailure,
}: {
  onNotice: (message: string) => void;
  onFailure: (error: unknown) => void;
}) {
  const navigate = useNavigate();
  const proposals = useRowsInStatuses("proposals", OPEN_STATUSES);
  const clients = useClientsByIds((proposals ?? []).map((row) => row.clientId));
  const open = (proposalId: string) =>
    navigate(CLIENTS_ROUTES.proposal(proposalId));
  return (
    <>
      <ProposalFollowUps
        proposals={proposals}
        clients={clients}
        onOpen={open}
        onNotice={onNotice}
        onFailure={onFailure}
      />
      <SalesHabits clients={clients} onOpen={open} />
    </>
  );
}
