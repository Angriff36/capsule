/**
 * AUTHOR SEAM — Event readiness projection (AC-401 first slice).
 *
 * Pure functions only: no Convex ctx, no I/O. Readiness is a LIVE projection
 * over facts gathered by the caller — never a stored state machine and never a
 * frozen name on the Event. Nine domains, each issue carrying a machine code,
 * the affected record ids, a severity, a plain-language reason, and the
 * canonical resolving action.
 *
 * This slice never emits "blocking": a missing fact that would make one action
 * unsafe stays a per-action concern in the existing command guards
 * (docs/architecture/domain-gating-restraint.md — do not gate beginExecution).
 */

export const EVENT_READINESS_DOMAINS = [
  "commercial",
  "planning",
  "kitchen",
  "purchasing",
  "staffing",
  "packing",
  "packet",
  "execution",
  "closeout",
] as const;
export type EventReadinessDomain = (typeof EVENT_READINESS_DOMAINS)[number];
export type EventReadinessSeverity = "info" | "warning" | "blocking";
export type EventReadinessIssue = {
  code: string;
  affectedIds: string[];
  severity: EventReadinessSeverity;
  reason: string;
  resolvingAction: string;
};
export type EventReadinessDomainResult = {
  domain: EventReadinessDomain;
  issues: EventReadinessIssue[];
};
export type EventReadinessProjection = {
  eventId: string;
  domains: EventReadinessDomainResult[];
};

export type EventReadinessFacts = {
  eventId: string;
  stage: string;
  clientId: string | null;
  venueId: string | null;
  serviceStyleId: string | null;
  expectedHeadcount: number | null;
  quotedPrice: number | null;
  hasMenuDishes: boolean;
  assignedStaffIds: string[];
  openPrepTaskIds: string[];
  inFlightPackListIds: string[];
  inFlightDeliveryIds: string[];
  openPurchaseNeedIds: string[];
  openPacketIssueIds: string[];
  closeoutId: string | null;
  closeoutStatus: "draft" | "finalized" | null;
  /** Open change flags from the invoice, proposal and closeout
   * reconciliations (convex/lib/reconciliationFlags.ts). */
  reconciliationFlags?: EventReconciliationFlag[];
};

export type EventReconciliationFlag = {
  domain: "invoice" | "proposal" | "closeout";
  code: string;
  recordId: string;
  /** The flagged record status now. */
  status: string;
  /** Invoices only: Invoice.followEventPrice may run on this draft. */
  canFollowPrice?: boolean;
};

type FlagText = {
  domain: EventReadinessDomain;
  reason: string;
  /** The command that settles the flag, legal in the record status now. */
  resolvingAction: string;
};

const flagText = (
  domain: EventReadinessDomain,
  reason: string,
  resolvingAction: string,
): FlagText => ({ domain, reason, resolvingAction });

/** Plain words for each reconciliation flag code in the status the record
 * has now, and the command a person uses to settle it in that status. A code
 * and status with no entry is skipped, never guessed. */
function reconciliationFlagText(flag: EventReconciliationFlag): FlagText | null {
  const code = flag.code;
  const status = flag.status;
  const billReason =
    "The event price changed after this bill went to the client. The bill was not changed.";
  switch (code) {
    case "invoice_review":
      if (status !== "draft") return null;
      // A draft with only a deposit or lines can still take the new price.
      if (flag.canFollowPrice)
        return flagText(
          "commercial",
          "The event price changed, but this draft bill was changed by hand, so it kept its old amount. Check it, or move it to the new price.",
          "Invoice.followEventPrice",
        );
      return flagText(
        "commercial",
        "The event price changed, but this draft bill has tax, a discount, a payment or a credit, so it kept its old amount. Check it, or cancel it and make a new bill.",
        "Invoice.markVoided",
      );
    case "invoice_change_required":
      if (status === "sent" || status === "viewed" || status === "overdue")
        return flagText(
          "commercial",
          billReason + " Cancel it and send a new bill.",
          "Invoice.markVoided",
        );
      if (status === "partial")
        return flagText(
          "commercial",
          billReason + " Part of it is paid, so correct it with a credit.",
          "Invoice.applyCredit",
        );
      if (status === "paid")
        return flagText(
          "commercial",
          billReason + " It is paid, so correct it with a credit memo.",
          "Invoice.recordCreditMemo",
        );
      return null;
    case "proposal_review":
      // Open on every unsent drafted proposal linked to the event.
      if (status === "draft")
        return flagText(
          "commercial",
          "The guest count changed, but this draft proposal was set to another count by hand, so it kept its count. Check it, or move it to the event count.",
          "Proposal.followEventHeadcount",
        );
      return null;
    case "proposal_change_required":
      if (status === "sent" || status === "viewed")
        return flagText(
          "commercial",
          "The guest count changed after the client saw this proposal. The proposal was not changed. Replace it with a new proposal.",
          "Proposal.supersede",
        );
      // An accepted proposal is final; a change draft (Proposal.draft with
      // replacesProposalId) is the way to change it.
      if (status === "accepted")
        return flagText(
          "commercial",
          "The guest count changed after the client accepted this proposal. The proposal was not changed. Start a change to it.",
          "Proposal.draft",
        );
      return null;
    case "closeout_review":
      if (status === "draft")
        return flagText(
          "closeout",
          "The event budget changed after actuals went on this closeout, so it kept its old budget. Check it and save the closeout again.",
          "EventCloseout.capture",
        );
      return null;
    case "closeout_change_required":
      // No command changes a finalized closeout; the difference can only be
      // settled on the event itself.
      if (status === "finalized")
        return flagText(
          "closeout",
          "The event budget changed after this closeout was finalized. A finalized closeout cannot be changed. If the budget change was a mistake, set the event budget back.",
          "Event.correctCommercial",
        );
      return null;
    default:
      return null;
  }
}


/** An id is present only when it is a non-empty, non-blank string. */
function hasId(id: unknown): id is string {
  return typeof id === "string" && id.trim().length > 0;
}

export function projectEventReadiness(
  facts: EventReadinessFacts,
): EventReadinessProjection {
  const domains: EventReadinessDomainResult[] = EVENT_READINESS_DOMAINS.map(
    (domain) => ({ domain, issues: [] }),
  );
  const issuesOf = (domain: EventReadinessDomain): EventReadinessIssue[] =>
    domains.find((entry) => entry.domain === domain)!.issues;
  const add = (
    domain: EventReadinessDomain,
    code: string,
    affectedIds: string[],
    severity: EventReadinessSeverity,
    reason: string,
    resolvingAction: string,
  ) => {
    issuesOf(domain).push({
      code,
      affectedIds,
      severity,
      reason,
      resolvingAction,
    });
  };

  // commercial — quotedPrice 0 is a real seed; only a MISSING price warns.
  if (
    typeof facts.quotedPrice !== "number" ||
    !Number.isFinite(facts.quotedPrice)
  ) {
    add(
      "commercial",
      "commercial.quoted_price_missing",
      [facts.eventId],
      "warning",
      "This event has no quoted price to seed billing.",
      "Event.changePricing",
    );
  }

  // planning
  if (!hasId(facts.clientId)) {
    add(
      "planning",
      "planning.client_missing",
      [facts.eventId],
      "warning",
      "This event has no client yet.",
      "Event.planEngagement",
    );
  }
  if (!hasId(facts.venueId)) {
    add(
      "planning",
      "planning.venue_missing",
      [facts.eventId],
      "info",
      "This event has no venue yet.",
      "Event.changeVenue",
    );
  }
  if (!hasId(facts.serviceStyleId)) {
    add(
      "planning",
      "planning.service_style_missing",
      [facts.eventId],
      "warning",
      "This event has no service style yet.",
      "Event.changeServiceStyle",
    );
  }
  if (
    typeof facts.expectedHeadcount !== "number" ||
    !Number.isFinite(facts.expectedHeadcount) ||
    facts.expectedHeadcount <= 0
  ) {
    add(
      "planning",
      "planning.headcount_missing",
      [facts.eventId],
      "warning",
      "This event has no expected headcount yet.",
      "Event.changeHeadcount",
    );
  }

  // kitchen
  if (!facts.hasMenuDishes) {
    add(
      "kitchen",
      "kitchen.menu_empty",
      [facts.eventId],
      "warning",
      "This event has no dishes on its menu.",
      "EventDish.addToEvent",
    );
  }
  for (const taskId of facts.openPrepTaskIds) {
    add(
      "kitchen",
      "kitchen.prep_open",
      [taskId],
      "warning",
      "A prep task for this event is still open.",
      "PrepTask.complete",
    );
  }

  // purchasing
  for (const needId of facts.openPurchaseNeedIds) {
    add(
      "purchasing",
      "purchasing.need_open",
      [needId],
      "warning",
      "A purchase need for this event is still open.",
      "PurchaseNeed.create",
    );
  }

  // staffing — coverage math is not product-defined yet, so this stays info.
  if (facts.assignedStaffIds.length === 0) {
    add(
      "staffing",
      "staffing.assignment_missing",
      [facts.eventId],
      "info",
      "No staff are assigned to this event yet.",
      "EventAssignment.assign",
    );
  }

  // packing
  for (const listId of facts.inFlightPackListIds) {
    add(
      "packing",
      "packing.list_in_flight",
      [listId],
      "warning",
      "A pack list for this event is not fully packed.",
      "PackList.markPacked",
    );
  }
  for (const deliveryId of facts.inFlightDeliveryIds) {
    add(
      "packing",
      "packing.delivery_in_flight",
      [deliveryId],
      "warning",
      "A delivery for this event has not arrived.",
      "Delivery.markDelivered",
    );
  }

  // packet
  for (const issueId of facts.openPacketIssueIds) {
    add(
      "packet",
      "packet.issue_open",
      [issueId],
      "warning",
      "An open issue is on this event's packet.",
      "EventPacketIssue.resolve",
    );
  }

  // execution — structured view of the same facts isReadyForExecution reads,
  // but NEVER blocking: beginExecution is not gated on readiness.
  for (const taskId of facts.openPrepTaskIds) {
    add(
      "execution",
      "execution.prep_open",
      [taskId],
      "warning",
      "Prep for this event is still open.",
      "PrepTask.complete",
    );
  }
  for (const listId of facts.inFlightPackListIds) {
    add(
      "execution",
      "execution.pack_open",
      [listId],
      "warning",
      "Packing for this event is still open.",
      "PackList.markPacked",
    );
  }
  for (const deliveryId of facts.inFlightDeliveryIds) {
    add(
      "execution",
      "execution.delivery_open",
      [deliveryId],
      "warning",
      "A delivery for this event has not arrived.",
      "Delivery.markDelivered",
    );
  }

  // closeout
  const eventIsOver =
    facts.stage === "completed" || facts.stage === "closed_out";
  if (eventIsOver && !hasId(facts.closeoutId)) {
    add(
      "closeout",
      "closeout.missing",
      [facts.eventId],
      "warning",
      "This event finished but has no closeout record.",
      "Event.closeOut",
    );
  }
  if (facts.closeoutStatus === "draft" && hasId(facts.closeoutId)) {
    add(
      "closeout",
      "closeout.unfinalized",
      [facts.closeoutId],
      "warning",
      "This event's closeout is still a draft.",
      "EventCloseout.finalize",
    );
  }

  // change flags — a record the reconciliation kept instead of rewriting.
  for (const flag of facts.reconciliationFlags ?? []) {
    const text = reconciliationFlagText(flag);
    if (!text) continue;
    add(
      text.domain,
      text.domain + "." + flag.code,
      [flag.recordId],
      "warning",
      text.reason,
      text.resolvingAction,
    );
  }

  return { eventId: facts.eventId, domains };
}

/** The one domain result for `domain`, in the projection's order. */
export function readinessDomain(
  projection: EventReadinessProjection,
  domain: EventReadinessDomain,
): EventReadinessDomainResult {
  return (
    projection.domains.find((entry) => entry.domain === domain) ?? {
      domain,
      issues: [],
    }
  );
}
