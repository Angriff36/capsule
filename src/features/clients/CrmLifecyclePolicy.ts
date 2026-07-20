import {
  ClientArchiveLifecycle,
  ClientReactivateLifecycle,
  ContractExpireLifecycle,
  ContractMarkViewedLifecycle,
  ContractMarkVoidedLifecycle,
  ContractSendLifecycle,
  ContractSignLifecycle,
  ProposalAcceptLifecycle,
  ProposalDeclineLifecycle,
  ProposalExpireLifecycle,
  ProposalMarkViewedLifecycle,
  ProposalSendLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface CrmAction<Key extends string = string> {
  key: Key;
  label: string;
}

type Lifecycle = readonly {
  property: string;
  from: string;
  to: string;
  proven: boolean;
}[];

function available<Key extends string>(
  status: string,
  actions: readonly (CrmAction<Key> & { lifecycle: Lifecycle })[],
): CrmAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const CLIENT_ACTIONS = [
  { key: "archive", label: "Archive", lifecycle: ClientArchiveLifecycle },
  {
    key: "reactivate",
    label: "Reactivate",
    lifecycle: ClientReactivateLifecycle,
  },
] as const;

const PROPOSAL_ACTIONS = [
  { key: "send", label: "Send", lifecycle: ProposalSendLifecycle },
  {
    key: "markViewed",
    label: "Mark viewed",
    lifecycle: ProposalMarkViewedLifecycle,
  },
  { key: "accept", label: "Accept", lifecycle: ProposalAcceptLifecycle },
  { key: "decline", label: "Decline", lifecycle: ProposalDeclineLifecycle },
  { key: "expire", label: "Expire", lifecycle: ProposalExpireLifecycle },
] as const;

const CONTRACT_ACTIONS = [
  { key: "send", label: "Send", lifecycle: ContractSendLifecycle },
  {
    key: "markViewed",
    label: "Mark viewed",
    lifecycle: ContractMarkViewedLifecycle,
  },
  { key: "sign", label: "Sign", lifecycle: ContractSignLifecycle },
  { key: "expire", label: "Expire", lifecycle: ContractExpireLifecycle },
  { key: "void", label: "Void", lifecycle: ContractMarkVoidedLifecycle },
] as const;

/** Derives CRM lifecycle actions from generated Manifest metadata. */
export class CrmLifecyclePolicy {
  clientActions(status: string) {
    return available(status, CLIENT_ACTIONS);
  }

  proposalActions(status: string) {
    return available(status, PROPOSAL_ACTIONS);
  }

  contractActions(status: string) {
    return available(status, CONTRACT_ACTIONS);
  }
}
