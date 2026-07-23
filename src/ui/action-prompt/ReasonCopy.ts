/** Shared vocabulary for lifecycle reason prompts across workspaces. */
export const ReasonCopy = {
  retireRecipe: {
    title: "Retire recipe",
    description: "Record why this recipe is leaving the active book.",
    label: "Retirement reason",
    placeholder: "e.g. Replaced by seasonal revision",
    confirmLabel: "Retire recipe",
  },
  retireDish: {
    title: "Retire dish",
    description:
      "You can restore this dish later from the catalog or detail page.",
    label: "Retirement reason",
    placeholder: "e.g. No longer on the house menu",
    confirmLabel: "Retire dish",
  },
  retireDishBulk: (count: number) => ({
    title: `Retire ${count} dish${count === 1 ? "" : "es"}`,
    description:
      "Selected dishes leave the active catalog. You can restore them later.",
    confirmLabel: `Retire ${count} dish${count === 1 ? "" : "es"}`,
  }),
  discontinueIngredient: {
    title: "Discontinue ingredient",
    description:
      "Explain why this ingredient should leave the active pantry list.",
    label: "Discontinuation reason",
    placeholder: "e.g. Supplier no longer stocks this item",
    confirmLabel: "Discontinue",
  },
  archiveMenu: {
    title: "Archive menu",
    description: "Archived menus leave the publishable set until restored.",
    label: "Archive reason",
    placeholder: "e.g. Season ended",
    confirmLabel: "Archive menu",
  },
  unpublishMenu: {
    title: "Return menu to draft",
    description: "Explain why this menu should leave published status.",
    label: "Return-to-draft reason",
    placeholder: "e.g. Pricing revision in progress",
    confirmLabel: "Return to draft",
  },
  removeLine: {
    title: "Remove line",
    description: "Record why this line is being removed.",
    label: "Removal reason",
    placeholder: "e.g. Menu revision removed this item",
    confirmLabel: "Remove",
  },
  cancelNeed: {
    title: "Cancel purchase need",
    description: "Record why this need is leaving the open queue.",
    label: "Cancellation reason",
    placeholder: "e.g. Covered by existing stock",
    confirmLabel: "Cancel need",
  },
  cancelOrder: {
    title: "Cancel vendor order",
    description: "Record why this order is being cancelled.",
    label: "Cancellation reason",
    placeholder: "e.g. Duplicate draft",
    confirmLabel: "Cancel order",
  },
  requestOrderChanges: {
    title: "Request modifications",
    description: "Send this order back to the buyer with what needs to change.",
    label: "Requested changes",
    placeholder: "e.g. Trim the protein order — 20 lb still frozen",
    confirmLabel: "Send back to draft",
  },
  terminateVendorContract: {
    title: "Terminate contract",
    description: "Record why this agreement is ending before its end date.",
    label: "Termination reason",
    placeholder: "e.g. Terms renegotiated into a new contract",
    confirmLabel: "Terminate contract",
  },
  cancelShift: {
    title: "Cancel shift",
    description: "Record why this shift is being cancelled.",
    label: "Cancellation reason",
    placeholder: "e.g. Event headcount reduced",
    confirmLabel: "Cancel shift",
  },
  cancelPackList: {
    title: "Cancel pack list",
    description:
      "Record why this pack list is leaving the active dispatch trace.",
    label: "Cancellation reason",
    placeholder: "e.g. Event cancelled or consolidated into another list",
    confirmLabel: "Cancel pack list",
  },
  cancelDelivery: {
    title: "Cancel delivery",
    description: "Record why this delivery will not run.",
    label: "Cancellation reason",
    placeholder: "e.g. Client pickup arranged instead",
    confirmLabel: "Cancel delivery",
  },
  failDelivery: {
    title: "Mark delivery failed",
    description: "Record why transit or handoff failed.",
    label: "Failure reason",
    placeholder: "e.g. Venue closed on arrival",
    confirmLabel: "Mark failed",
  },
  voidInvoice: {
    title: "Void invoice",
    description: "Voiding stops collection. Paid invoices cannot be voided.",
    label: "Void reason",
    placeholder: "e.g. Issued to the wrong client",
    confirmLabel: "Void invoice",
  },
  writeOffInvoice: {
    title: "Write off invoice",
    description:
      "Writes off the remaining amount due. Use only when the balance will not be collected.",
    label: "Write-off reason",
    placeholder: "e.g. Client insolvency",
    confirmLabel: "Write off",
  },
  failPayment: {
    title: "Mark payment failed",
    description: "Record why this payment did not clear.",
    label: "Failure reason",
    placeholder: "e.g. Card declined",
    confirmLabel: "Mark failed",
  },
  refundPayment: {
    title: "Refund payment",
    description: "Records a refund against a settled payment.",
    label: "Refund reason",
    placeholder: "e.g. Event cancelled after payment",
    confirmLabel: "Refund payment",
  },
  voidPayrollInput: {
    title: "Void payroll input",
    description:
      "Voiding removes this rollup from the export set. Prepare a new input if needed.",
    label: "Void reason",
    placeholder: "e.g. Wrong period or incorrect minutes",
    confirmLabel: "Void payroll input",
  },

  archiveClient: {
    title: "Archive client",
    description:
      "Archived clients leave the active sales list. You can reactivate later.",
    label: "Archive reason",
    placeholder: "e.g. Account inactive / lost",
    confirmLabel: "Archive client",
  },
  voidContract: {
    title: "Void contract",
    description: "Voiding stops the agreement before signature.",
    label: "Void reason",
    placeholder: "e.g. Terms renegotiated",
    confirmLabel: "Void contract",
  },
  signContract: {
    title: "Record signature",
    description:
      "Enter the signer name. Event confirmation stays a separate Events step.",
    label: "Signed by",
    placeholder: "e.g. Jordan Lee",
    confirmLabel: "Mark signed",
  },
  removeContact: {
    title: "Remove contact",
    description: "Record why this contact is leaving the client roster.",
    label: "Removal reason",
    placeholder: "e.g. Left the company",
    confirmLabel: "Remove contact",
  },

  supersedeDemand: {
    title: "Supersede demand",
    description: "Explain what replaces this demand signal.",
    label: "Supersede reason",
    placeholder: "e.g. Regenerated after menu change",
    confirmLabel: "Supersede",
  },
  releaseReservation: {
    title: "Release reservation",
    description: "Record why reserved stock is being released.",
    label: "Release reason",
    placeholder: "e.g. Event cancelled",
    confirmLabel: "Release",
  },
} as const;
