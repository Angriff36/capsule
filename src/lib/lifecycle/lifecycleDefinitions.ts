import type { Doc } from "../api";
import type { LifecycleDefinition } from "./lifecycleModel";

type EventStage = Doc<"events">["stage"];
type ProposalStatus = Doc<"proposals">["status"];
type InvoiceStatus = Doc<"invoices">["status"];
type BatchStatus = Doc<"productionBatches">["status"];

export const eventLifecycle = {
  label: "Event lifecycle",
  path: [
    "quote",
    "planning",
    "pending_approval",
    "approved",
    "sales_lock",
    "executing",
    "final",
    "completed",
    "closed_out",
  ] satisfies readonly EventStage[],
  sideStates: ["cancelled"] satisfies readonly EventStage[],
  actions: [
    {
      key: "submitForApproval",
      label: "Submit for approval",
      to: "pending_approval",
    },
    {
      key: "returnToPlanning",
      label: "Return to planning",
      to: "planning",
      needsInput: true,
    },
    { key: "approve", label: "Approve", to: "approved" },
    { key: "lockForSales", label: "Lock for sales", to: "sales_lock" },
    {
      key: "confirmSalesLock",
      label: "Confirm sales lock & start execution",
      to: "executing",
    },
    { key: "beginExecution", label: "Begin execution", to: "executing" },
    { key: "finalizeEvent", label: "Finalize event", to: "final" },
    { key: "complete", label: "Complete", to: "completed" },
    { key: "closeOut", label: "Close out", to: "closed_out" },
    { key: "cancel", label: "Cancel event", to: "cancelled", needsInput: true },
  ],
} satisfies LifecycleDefinition;

export const proposalLifecycle = {
  label: "Proposal lifecycle",
  path: [
    "draft",
    "sent",
    "viewed",
    "accepted",
  ] satisfies readonly ProposalStatus[],
  sideStates: [
    "declined",
    "expired",
    "superseded",
  ] satisfies readonly ProposalStatus[],
  actions: [
    { key: "send", label: "Publish proposal", to: "sent" },
    { key: "markViewed", label: "Mark viewed", to: "viewed" },
    { key: "accept", label: "Accept", to: "accepted" },
    { key: "decline", label: "Decline", to: "declined" },
    { key: "expire", label: "Expire", to: "expired" },
  ],
} satisfies LifecycleDefinition;

export const invoiceLifecycle = {
  label: "Invoice lifecycle",
  path: [
    "draft",
    "sent",
    "viewed",
    "overdue",
    "partial",
    "paid",
  ] satisfies readonly InvoiceStatus[],
  sideStates: ["voided", "written_off"] satisfies readonly InvoiceStatus[],
  actions: [
    { key: "send", label: "Mark sent", to: "sent" },
    { key: "markViewed", label: "Mark viewed", to: "viewed" },
    { key: "markOverdue", label: "Mark overdue", to: "overdue" },
    { key: "void", label: "Void", to: "voided", needsInput: true },
    {
      key: "writeOff",
      label: "Write off",
      to: "written_off",
      needsInput: true,
    },
  ],
} satisfies LifecycleDefinition;

export const productionBatchLifecycle = {
  label: "Production batch lifecycle",
  path: [
    "planned",
    "in_progress",
    "completed",
  ] satisfies readonly BatchStatus[],
  sideStates: ["cancelled"] satisfies readonly BatchStatus[],
  actions: [
    { key: "start", label: "Start", to: "in_progress" },
    { key: "complete", label: "Complete", to: "completed", needsInput: true },
    { key: "cancel", label: "Cancel batch", to: "cancelled", needsInput: true },
  ],
} satisfies LifecycleDefinition;
