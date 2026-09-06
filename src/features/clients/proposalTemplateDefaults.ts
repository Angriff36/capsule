import { computeProposalPricing } from "../../lib/pricing";

export type ProposalTemplateDefaultsSource = {
  defaultTerms?: string | null;
  defaultNotes?: string | null;
  defaultTaxRate?: number | null;
  defaultServiceChargePercent?: number | null;
  validityDays?: number | null;
  visibleSections?: string[] | null;
};

const dateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function proposalTemplateDefaults(
  template: ProposalTemplateDefaultsSource | null,
  baseSubtotal: number,
  now = new Date(),
) {
  const validity = new Date(now);
  validity.setDate(validity.getDate() + (template?.validityDays ?? 14));
  const serviceRate = template?.defaultServiceChargePercent ?? null;
  const serviceChargeLine =
    serviceRate == null
      ? null
      : {
          description: "Service charge",
          pricingBasis: "percentage" as const,
          unitPrice: serviceRate * 100,
          quantity: 1,
          unit: "%",
        };
  const subtotalWithService = serviceChargeLine
    ? computeProposalPricing({
        lines: [
          {
            pricingBasis: "flat",
            unitPrice: baseSubtotal,
            quantity: 1,
          },
          serviceChargeLine,
        ],
        guestCount: 0,
        taxAmount: 0,
        discountAmount: 0,
      }).subtotal
    : baseSubtotal;

  return {
    terms: template?.defaultTerms ?? "",
    notes: template?.defaultNotes ?? "",
    expiresOn: dateInput(validity),
    taxAmount:
      Math.round(subtotalWithService * (template?.defaultTaxRate ?? 0) * 100) /
      100,
    visibleSections: [...(template?.visibleSections ?? [])],
    serviceChargeLine,
  };
}
