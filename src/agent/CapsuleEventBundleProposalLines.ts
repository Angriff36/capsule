import type { EventBundle } from "../lib/tppReports/eventBundle";
import {
  centsToDollars,
  normalizeName,
  type PlannedStep,
} from "./CapsuleEventBundleShared";

/**
 * The priced lines a TPP bundle puts on its proposal: one per priced menu
 * item plus the service charge. Pure; the commerce planner decides which of
 * them are still missing from a proposal that already exists.
 */

export interface PlannedProposalLine {
  description: string;
  step: PlannedStep;
}

function menuLine(
  bundle: EventBundle,
  invoice: string,
  index: number,
): PlannedProposalLine | undefined {
  const item = bundle.menu[index];
  if (
    item === undefined ||
    (item.unitPriceCents === undefined && item.totalPriceCents === undefined)
  ) {
    return undefined;
  }
  const quantity = item.quantityServings ?? bundle.header.guestCount ?? 1;
  const amount = centsToDollars(
    item.totalPriceCents ?? (item.unitPriceCents ?? 0) * quantity,
  );
  const unitPrice = centsToDollars(
    item.unitPriceCents ??
      (quantity > 0 ? Math.round((item.totalPriceCents ?? 0) / quantity) : 0),
  );
  const perPerson =
    quantity > 1 &&
    item.unitPriceCents !== undefined &&
    Math.abs(item.unitPriceCents * quantity - (item.totalPriceCents ?? 0)) <
      quantity;
  const description = item.course ? `${item.name} (${item.course})` : item.name;
  return {
    description,
    step: {
      capabilityId: "ProposalLineItem.addLine",
      ref: `proposal-line:${index}`,
      label: `Price ${item.name} on the proposal`,
      idempotencySuffix: `proposal-line:${invoice}:${normalizeName(item.name)}`,
      resolveRefs: ["proposalId"],
      args: {
        proposalId: "proposal",
        description,
        pricingBasis: perPerson ? "per_person" : "flat",
        unitPrice: perPerson ? unitPrice : amount,
        amount,
        quantity: perPerson ? quantity : 1,
        unit: perPerson ? "serving" : undefined,
        sortOrder: index,
      },
    },
  };
}

function serviceChargeLine(
  bundle: EventBundle,
  invoice: string,
): PlannedProposalLine | undefined {
  const cents = bundle.totals.serviceChargeCents;
  if (cents === undefined || cents <= 0) return undefined;
  return {
    description: "Service charge",
    step: {
      capabilityId: "ProposalLineItem.addLine",
      ref: "proposal-line:service",
      label: "Add the service charge to the proposal",
      idempotencySuffix: `proposal-line:${invoice}:servicecharge`,
      resolveRefs: ["proposalId"],
      args: {
        proposalId: "proposal",
        description: "Service charge",
        pricingBasis: "flat",
        unitPrice: centsToDollars(cents),
        amount: centsToDollars(cents),
        quantity: 1,
        sortOrder: bundle.menu.length,
      },
    },
  };
}

/** Every line the bundle prices, in proposal order. */
export function planProposalLines(
  bundle: EventBundle,
  invoice: string,
): PlannedProposalLine[] {
  const lines = bundle.menu
    .map((_, index) => menuLine(bundle, invoice, index))
    .filter((line): line is PlannedProposalLine => line !== undefined);
  const service = serviceChargeLine(bundle, invoice);
  return service ? [...lines, service] : lines;
}

/** The planned lines whose description is not already on the proposal. */
export function missingProposalLines(
  planned: PlannedProposalLine[],
  existingDescriptions: readonly string[],
): PlannedProposalLine[] {
  const present = new Set(existingDescriptions.map(normalizeName));
  return planned.filter(
    (line) => !present.has(normalizeName(line.description)),
  );
}
