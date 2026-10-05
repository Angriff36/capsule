import { computeProposalPricing } from "../../lib/pricing";

export type ProposalTemplateDefaultsSource = {
  defaultTerms?: string | null;
  defaultNotes?: string | null;
  defaultTaxRate?: number | null;
  defaultServiceChargePercent?: number | null;
  validityDays?: number | null;
  visibleSections?: string[] | null;
  sectionOrder?: string[] | null;
};

/**
 * The active template made for this service style, if any (PL-CATALOGS
 * AC-221/AC-222). Several: the first by name, so the pick never changes
 * between visits.
 */
export function templateForServiceStyle<
  T extends {
    _id: string;
    name?: string | null;
    status?: string | null;
    deletedAt?: number | null;
    serviceStyleId?: string | null;
  },
>(templates: readonly T[], serviceStyleId: string | null | undefined) {
  if (!serviceStyleId) return null;
  return (
    templates
      .filter(
        (row) =>
          row.status === "active" &&
          row.deletedAt == null &&
          row.serviceStyleId === serviceStyleId,
      )
      .sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? "")),
      )[0] ?? null
  );
}

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
    sectionOrder: [...(template?.sectionOrder ?? [])],
    serviceChargeLine,
  };
}
