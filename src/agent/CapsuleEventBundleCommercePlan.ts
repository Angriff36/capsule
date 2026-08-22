import type { EventBundle } from "../lib/tppReports/eventBundle";
import { toEpochMillis } from "../lib/tppReports/reportValues";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import {
  centsToDollars,
  normalizeName,
  operationalRequirementsText,
  personNameParts,
  venueAddressText,
  type PlannedStep,
} from "./CapsuleEventBundleShared";
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
  counts: {
    clientContacts: number;
    proposalLines: number;
    payments: number;
    staffAssignments: number;
  };
}

function paymentMethod(
  method: string | undefined,
): "card" | "check" | "cash" | "ach" | "other" {
  const text = (method ?? "").toLowerCase();
  if (/visa|master|amex|americanexpress|discover|card|credit/.test(text)) {
    return "card";
  }
  if (/check|cheque/.test(text)) return "check";
  if (/cash/.test(text)) return "cash";
  if (/ach|wire|bank|transfer/.test(text)) return "ach";
  return "other";
}

function dateEpoch(date: string | undefined): number | undefined {
  return date === undefined ? undefined : toEpochMillis(date, 0);
}

export function planCommerceSteps(
  input: CommercePlanInput,
): CommercePlanResult {
  const { bundle, invoice, context } = input;
  const existing = context.existing;
  const steps: PlannedStep[] = [];
  const warnings: string[] = [];
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

    const proposalKnown = context.directory?.proposalNumbers.includes(invoice);
    if (!proposalKnown) {
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

    const invoiceKnown = context.directory?.invoiceNumbers.includes(invoice);
    if (invoiceKnown) {
      if (bundle.payments.length > 0) {
        warnings.push(
          `Invoice ${invoice} already exists, so its ${bundle.payments.length} payment(s) were left as they are.`,
        );
      }
    } else {
      steps.push({
        capabilityId: "Invoice.issue",
        ref: "invoice",
        label: `Issue invoice ${invoice}`,
        idempotencySuffix: `invoice:${invoice}`,
        resolveRefs: ["clientId", "eventId"],
        args: {
          clientId: "client",
          eventId: "event",
          invoiceNumber: invoice,
          ...money,
          dueDate: dateEpoch(totals.finalBalanceDueDate),
          notes: [
            `Imported from the TPP proposal for invoice ${invoice}.`,
            totals.depositCents !== undefined
              ? `Deposit $${centsToDollars(totals.depositCents).toFixed(2)}${totals.depositDueDate ? ` due ${totals.depositDueDate}` : ""}.`
              : undefined,
            statusNote,
          ]
            .filter(Boolean)
            .join(" "),
        },
      });
      if (totals.depositCents !== undefined && totals.depositCents > 0) {
        steps.push({
          capabilityId: "Invoice.setDeposit",
          ref: "invoice-deposit",
          label: "Set the deposit on the invoice",
          idempotencySuffix: `invoice-deposit:${invoice}`,
          resolveRefs: ["docId"],
          args: {
            docId: "invoice",
            depositAmount: centsToDollars(totals.depositCents),
          },
        });
      }
      bundle.payments.forEach((payment, index) => {
        if (payment.amountCents === undefined || payment.amountCents < 100) {
          return;
        }
        counts.payments += 1;
        steps.push({
          capabilityId: "Payment.record",
          ref: `payment:${index}`,
          label: `Record payment of $${centsToDollars(payment.amountCents).toFixed(2)}${payment.date ? ` on ${payment.date}` : ""}`,
          idempotencySuffix: `payment:${invoice}:${index}:${payment.amountCents}`,
          resolveRefs: ["invoiceId", "clientId", "eventId"],
          args: {
            invoiceId: "invoice",
            clientId: "client",
            eventId: "event",
            amount: centsToDollars(payment.amountCents),
            method: paymentMethod(payment.method),
            notes: [
              payment.date,
              payment.method,
              payment.reference,
              payment.note,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        });
      });
    }
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

  return { steps, warnings, counts };
}
