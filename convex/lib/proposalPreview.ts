// Owner, 2026-10-13: a proposal is generated in one click as a printable
// report and is NOT saved; Capsule saves and tracks a proposal only when a
// person sends it to the client. This query shows what Send would send — the
// same event sources, template and (when the event has one) the event's price
// list that convex/lib/proposalGenerate.ts builds from — and writes nothing.

import { query } from "../_generated/server";
import { v } from "convex/values";
import { computeProposalPricing, type PricingBasis } from "../../src/lib/pricing";
import { parseGenerationRecord, planLines } from "../../src/lib/proposalGeneration";
import { getAuthContext, requireTenant } from "./authContext";
import {
  findGeneratedDraft,
  readEventSources,
  readProposalLines,
  readScopedEvent,
} from "./proposalGenerateSources";
import { templateForStyle } from "./proposalGenerate";
import { draftPriceList } from "./eventPriceList";

type PreviewLine = {
  description: string;
  pricingBasis: PricingBasis;
  unitPrice: number;
  quantity: number;
};

export const previewProposalFromEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const event = await readScopedEvent(ctx, tenantId, eventId);
    const read = await readEventSources(ctx, event);
    const clientRow = event.clientId ? await ctx.db.get(event.clientId) : null;
    const client =
      clientRow && clientRow.tenantId === tenantId && clientRow.deletedAt == null ? clientRow : null;
    const sources = [...read.sources].sort((a, b) => a.sortOrder - b.sortOrder);

    // The event's price list (an unsent draft). A built one is brought up to
    // date from the event on Send; one priced by hand is sent as it stands.
    const draft = (await draftPriceList(ctx, event)) ?? (await findGeneratedDraft(ctx, event));
    const builtList = draft?.generationJson != null;
    let lines: PreviewLine[];
    let terms: string | null;
    let notes: string | null;
    let validityDays = 14;
    let taxAmount: number | null = null;
    let discountPercent: number | null = null;
    let discountAmount = 0;
    if (draft) {
      const { rows, existing } = await readProposalLines(ctx, draft);
      const plan = builtList
        ? planLines(parseGenerationRecord(draft.generationJson), sources, existing)
        : { add: [], revise: [], remove: [] as string[] };
      const removed = new Set(plan.remove);
      const revised = new Map(plan.revise.map((entry) => [entry.lineId, entry.source]));
      const live = rows
        .filter((row) => row.deletedAt == null && row.removedAt == null && !removed.has(String(row._id)))
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
      lines = [
        ...live.map((row) => {
          const source = revised.get(String(row._id));
          return source
            ? {
                description: source.values.description,
                pricingBasis: source.values.pricingBasis as PricingBasis,
                unitPrice: source.values.unitPrice,
                quantity: source.values.quantity,
              }
            : {
                description: row.description,
                pricingBasis: String(row.pricingBasis) as PricingBasis,
                unitPrice: Number(row.unitPrice) || 0,
                quantity: Number(row.quantity) || 0,
              };
        }),
        ...plan.add.map((source) => ({
          description: source.values.description,
          pricingBasis: source.values.pricingBasis as PricingBasis,
          unitPrice: source.values.unitPrice,
          quantity: source.values.quantity,
        })),
      ];
      terms = draft.terms ?? null;
      notes = draft.notes ?? null;
      if (draft.expiresAt != null) {
        validityDays = Math.max(1, Math.round((draft.expiresAt - Date.now()) / 86_400_000));
      }
      // The stored tax is current only while the lines are as saved.
      const unchanged = plan.add.length + plan.revise.length + plan.remove.length === 0;
      taxAmount = unchanged ? Number(draft.taxAmount) || 0 : null;
      discountPercent = draft.discountPercent ?? null;
      discountAmount = Number(draft.discountAmount) || 0;
    } else {
      const template = await templateForStyle(ctx, event);
      const serviceRate = Number(template?.defaultServiceChargePercent ?? 0);
      lines = [
        ...sources.map((source) => ({
          description: source.values.description,
          pricingBasis: source.values.pricingBasis as PricingBasis,
          unitPrice: source.values.unitPrice,
          quantity: source.values.quantity,
        })),
        ...(serviceRate > 0
          ? [
              {
                description: "Service charge",
                pricingBasis: "percentage" as PricingBasis,
                unitPrice: Math.round(serviceRate * 10_000) / 100,
                quantity: 1,
              },
            ]
          : []),
      ];
      terms = template?.defaultTerms ?? null;
      notes = template?.defaultNotes ?? null;
      validityDays = template?.validityDays ?? 14;
    }

    const guestCount = read.facts.guestCount;
    const undiscounted = computeProposalPricing({ lines, guestCount, discountAmount: 0, taxAmount: 0 }).subtotal;
    const discount =
      discountPercent != null
        ? Math.round(undiscounted * Number(discountPercent)) / 100
        : Math.min(discountAmount, undiscounted);
    const pricing = computeProposalPricing({
      lines,
      guestCount,
      discountAmount: discount,
      taxAmount: taxAmount ?? 0,
    });
    return {
      eventId,
      title: event.title,
      hasClient: client != null,
      clientName: client
        ? client.companyName?.trim() ||
          [client.givenName, client.familyName].filter((part) => part?.trim()).join(" ") ||
          "Client"
        : null,
      // A protected (encrypted) address is left off; the venue name stays.
      facts: {
        ...read.facts,
        venueAddress: read.facts.venueAddress?.startsWith("{") ? null : read.facts.venueAddress,
      },
      /** Send sends this hand-priced price list as it stands; otherwise it builds. */
      sendAsIs: draft && !builtList ? { proposalId: draft._id, version: draft.version ?? 1 } : null,
      terms,
      notes,
      validityDays,
      lines: pricing.lines.map((line, index) => ({
        description: lines[index].description,
        pricingBasis: line.pricingBasis,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        amount: line.amount,
      })),
      subtotal: pricing.subtotal,
      discountAmount: discount,
      /** null: the tax is worked out when the proposal is sent. */
      taxAmount,
      total: pricing.total,
    };
  },
});
