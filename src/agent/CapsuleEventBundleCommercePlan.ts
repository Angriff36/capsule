import type { EventBundle } from "../lib/tppReports/eventBundle";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import {
  centsToDollars,
  normalizeName,
  operationalRequirementsText,
  personNameParts,
  venueAddressText,
  type PlannedStep,
} from "./CapsuleEventBundleShared";
import { planBillingSteps } from "./CapsuleEventBundleBillingPlan";
import { planStaffSteps } from "./CapsuleEventBundleStaffPlan";

/**
 * The commercial half of a TPP bundle: contacts, pricing, the proposal with
 * its priced lines, the invoice with deposit and payments, and the staff the
 * battle board names. Pure: decides calls, makes none.
 */

export interface CommercePlanInput {
  bundle: EventBundle;
  invoice: string;
  eventDate: string;
  startsAt: number;
  endsAt: number;
  context: CapsuleEventBundleContext;
}

export interface CommercePlanResult {
  steps: PlannedStep[];
  warnings: string[];
  /** Ids that already exist, keyed by the ref the steps use. */
  seedIds: Record<string, string>;
  counts: {
    clientContacts: number;
    proposalLines: number;
    payments: number;
    staffAssignments: number;
  };
}

export function planCommerceSteps(
  input: CommercePlanInput,
): CommercePlanResult {
  const { bundle, invoice, context } = input;
  const existing = context.existing;
  const steps: PlannedStep[] = [];
  const warnings: string[] = [];
  const seedIds: Record<string, string> = {};
  const counts = {
    clientContacts: 0,
    proposalLines: 0,
    payments: 0,
    staffAssignments: 0,
  };
  const totals = bundle.totals;

  // --- Facts the event record already carries when created fresh; on an
  // existing event they are applied only where the record is still empty.
  if (existing) {
    if (
      totals.eventTotalCents !== undefined &&
      totals.eventTotalCents > 0 &&
      existing.event.quotedPrice === 0
    ) {
      steps.push({
        capabilityId: "Event.changePricing",
        ref: "event-pricing",
        label: "Set the quoted price from the proposal",
        idempotencySuffix: `pricing:${invoice}`,
        resolveRefs: ["docId"],
        args: {
          docId: "event",
          budgetAmount: 0,
          quotedPrice: centsToDollars(totals.eventTotalCents),
        },
      });
    }
    const hasContact = bundle.client.email || bundle.client.phone;
    if (
      hasContact &&
      !existing.event.primaryContactEmail &&
      !existing.event.primaryContactPhone
    ) {
      steps.push({
        capabilityId: "Event.changePrimaryContact",
        ref: "event-contact",
        label: "Add the primary contact's email and phone",
        idempotencySuffix: `primary-contact:${invoice}`,
        resolveRefs: ["docId"],
        args: {
          docId: "event",
          primaryContactName:
            bundle.client.name ??
            existing.event.primaryContactName ??
            "Unknown contact",
          primaryContactEmail: bundle.client.email,
          primaryContactPhone: bundle.client.phone,
        },
      });
    }
    if (
      (hasContact || bundle.client.addressLine1) &&
      !existing.client.email &&
      !existing.client.phone
    ) {
      steps.push({
        capabilityId: "Client.changeContact",
        ref: "client-contact",
        label: "Add the client's contact details",
        idempotencySuffix: `client-contact:${invoice}`,
        resolveRefs: ["docId"],
        args: {
          docId: "client",
          email: bundle.client.email,
          phone: bundle.client.phone,
          addressLine1: bundle.client.addressLine1,
          city: bundle.client.city,
          region: bundle.client.region,
          postalCode: bundle.client.postalCode,
        },
      });
    }
    const operational = operationalRequirementsText(bundle);
    const service = bundle.notes.eventOverview;
    if (
      (operational !== undefined &&
        operational !== (existing.event.operationalRequirements ?? "")) ||
      (service !== undefined &&
        service !== (existing.event.serviceRequirements ?? ""))
    ) {
      steps.push({
        capabilityId: "Event.changeRequirements",
        ref: "event-requirements",
        label: "Bring the event notes up to date",
        idempotencySuffix: `requirements:${invoice}:${normalizeName(operational ?? "").length}`,
        resolveRefs: ["docId"],
        args: {
          docId: "event",
          serviceRequirements:
            service ?? existing.event.serviceRequirements ?? undefined,
          operationalRequirements:
            operational ?? existing.event.operationalRequirements ?? undefined,
        },
      });
    }
  }

  // --- Other contacts become client contacts.
  const knownContacts = new Set(
    (existing?.clientContactNames ?? []).map(normalizeName),
  );
  bundle.otherContacts.forEach((contact) => {
    if (!contact.name) return;
    const key = normalizeName(contact.name);
    if (knownContacts.has(key)) return;
    knownContacts.add(key);
    const { givenName, familyName } = personNameParts(contact.name);
    counts.clientContacts += 1;
    steps.push({
      capabilityId: "ClientContact.add",
      ref: `contact:${key}`,
      label: `Add contact ${contact.name}${contact.role ? ` (${contact.role})` : ""}`,
      idempotencySuffix: `contact:${invoice}:${key}`,
      resolveRefs: ["clientId"],
      args: {
        clientId: "client",
        givenName: givenName ?? contact.name,
        familyName,
        title: contact.role,
        email: contact.email,
        phone: contact.phone,
      },
    });
  });

  // --- Proposal with priced lines, invoice with deposit, then payments.
  const eventTotal = totals.eventTotalCents;
  if (eventTotal !== undefined && eventTotal > 0) {
    const tax = totals.taxCents ?? 0;
    const subtotalCents =
      totals.chargesCents !== undefined
        ? totals.chargesCents + (totals.serviceChargeCents ?? 0)
        : eventTotal - tax;
    // The commands require total == subtotal + tax - discount exactly.
    const discountCents = Math.max(0, subtotalCents + tax - eventTotal);
    const money = {
      subtotal: centsToDollars(subtotalCents),
      taxAmount: centsToDollars(tax),
      discountAmount: centsToDollars(discountCents),
      total: centsToDollars(subtotalCents + tax - discountCents),
    };
    const statusNote = bundle.header.status
      ? `TPP status: ${bundle.header.status}.`
      : undefined;

    // "2- Sales Lock" and the like mean the client signed: the proposal is
    // accepted and the invoice is out, not sitting as drafts.
    const signed = /sales\s*lock|contract|signed|confirmed|locked|final/i.test(
      bundle.header.status ?? "",
    );

    const knownProposal = context.directory?.proposals.find(
      (row) => row.proposalNumber === invoice,
    );
    if (knownProposal) seedIds.proposal = knownProposal.id;
    if (!knownProposal) {
      steps.push({
        capabilityId: "Proposal.draft",
        ref: "proposal",
        label: `Draft proposal ${invoice}`,
        idempotencySuffix: `proposal:${invoice}`,
        resolveRefs: ["clientId", "eventId"],
        args: {
          clientId: "client",
          eventId: "event",
          title: bundle.header.title ?? `TPP proposal ${invoice}`,
          proposalNumber: invoice,
          ...money,
          eventDate: input.startsAt,
          eventType: bundle.header.eventType ?? bundle.header.occasion,
          guestCount: bundle.header.guestCount,
          venueName: bundle.venue.name,
          venueAddress: venueAddressText(bundle),
          notes: [
            statusNote,
            totals.perPersonCents !== undefined
              ? `Per person: $${centsToDollars(totals.perPersonCents).toFixed(2)}.`
              : undefined,
            bundle.header.salespersonName
              ? `Salesperson: ${bundle.header.salespersonName}.`
              : undefined,
          ]
            .filter(Boolean)
            .join(" "),
        },
      });
      bundle.menu.forEach((item, index) => {
        if (
          item.unitPriceCents === undefined &&
          item.totalPriceCents === undefined
        ) {
          return;
        }
        const quantity = item.quantityServings ?? bundle.header.guestCount ?? 1;
        const amount = centsToDollars(
          item.totalPriceCents ?? (item.unitPriceCents ?? 0) * quantity,
        );
        const unitPrice = centsToDollars(
          item.unitPriceCents ??
            (quantity > 0
              ? Math.round((item.totalPriceCents ?? 0) / quantity)
              : 0),
        );
        const perPerson =
          quantity > 1 &&
          item.unitPriceCents !== undefined &&
          Math.abs(
            item.unitPriceCents * quantity - (item.totalPriceCents ?? 0),
          ) < quantity;
        counts.proposalLines += 1;
        steps.push({
          capabilityId: "ProposalLineItem.addLine",
          ref: `proposal-line:${index}`,
          label: `Price ${item.name} on the proposal`,
          idempotencySuffix: `proposal-line:${invoice}:${normalizeName(item.name)}`,
          resolveRefs: ["proposalId"],
          args: {
            proposalId: "proposal",
            description: item.course
              ? `${item.name} (${item.course})`
              : item.name,
            pricingBasis: perPerson ? "per_person" : "flat",
            unitPrice: perPerson ? unitPrice : amount,
            amount,
            quantity: perPerson ? quantity : 1,
            unit: perPerson ? "serving" : undefined,
            sortOrder: index,
          },
        });
      });
      if (
        totals.serviceChargeCents !== undefined &&
        totals.serviceChargeCents > 0
      ) {
        counts.proposalLines += 1;
        steps.push({
          capabilityId: "ProposalLineItem.addLine",
          ref: "proposal-line:service",
          label: "Add the service charge to the proposal",
          idempotencySuffix: `proposal-line:${invoice}:servicecharge`,
          resolveRefs: ["proposalId"],
          args: {
            proposalId: "proposal",
            description: "Service charge",
            pricingBasis: "flat",
            unitPrice: centsToDollars(totals.serviceChargeCents),
            amount: centsToDollars(totals.serviceChargeCents),
            quantity: 1,
            sortOrder: bundle.menu.length,
          },
        });
      }
    }

    if (signed) {
      const proposalStatus = knownProposal?.status ?? "draft";
      if (proposalStatus === "draft") {
        steps.push({
          capabilityId: "Proposal.send",
          ref: "proposal-sent",
          label: `Mark proposal ${invoice} sent`,
          idempotencySuffix: `proposal-send:${invoice}`,
          resolveRefs: ["docId"],
          args: { docId: "proposal" },
        });
      }
      if (["draft", "sent", "viewed"].includes(proposalStatus)) {
        steps.push({
          capabilityId: "Proposal.accept",
          ref: "proposal-accepted",
          label: `Mark proposal ${invoice} accepted (${bundle.header.status})`,
          idempotencySuffix: `proposal-accept:${invoice}`,
          resolveRefs: ["docId", "eventId"],
          args: { docId: "proposal", eventId: "event" },
        });
      }
    }

    const billing = planBillingSteps({
      bundle,
      invoice,
      money,
      statusNote,
      signed,
      context,
    });
    steps.push(...billing.steps);
    Object.assign(seedIds, billing.seedIds);
    counts.payments += billing.payments;
  }

  const staff = planStaffSteps({
    bundle,
    invoice,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    context,
  });
  steps.push(...staff.steps);
  warnings.push(...staff.warnings);
  counts.staffAssignments = staff.count;

  return { steps, warnings, seedIds, counts };
}
