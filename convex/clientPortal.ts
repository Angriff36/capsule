import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, query } from "./_generated/server";
import {
  createClientPortalToken,
  verifyClientPortalToken,
} from "./lib/clientPortalToken";

const CLIENT_VISIBLE_INVOICE_STATUSES = new Set([
  "sent",
  "viewed",
  "overdue",
  "partial",
  "paid",
]);

/**
 * Creates a bearer link only after the generated Event query authorizes the
 * current operator through Manifest's eventRead capability policy.
 */
export const createShareToken = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<string> => {
    const event: Doc<"events"> | null = await ctx.runQuery(
      api.queries.getEvent,
      { id: eventId },
    );
    if (!event) {
      throw new ConvexError(
        "Event unavailable. Check your workspace access and try again.",
      );
    }
    return createClientPortalToken({
      eventId: String(event._id),
      tenantId: event.tenantId,
    });
  },
});

/** Anonymous, token-authorized projection for the account-free client view. */
export const getEvent = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const access = await verifyClientPortalToken(token);
    if (!access) return null;

    const eventId = ctx.db.normalizeId("events", access.eventId);
    if (!eventId) return null;
    const event = await ctx.db.get(eventId);
    if (
      !event ||
      event.deletedAt != null ||
      event.tenantId !== access.tenantId
    ) {
      return null;
    }

    const [
      selections,
      organizations,
      client,
      contracts,
      proposals,
      invoices,
      timelineActivities,
      eventAssignments,
    ] = await Promise.all([
      ctx.db
        .query("eventDishes")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("organizations")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", event.tenantId))
        .collect(),
      ctx.db.get(event.clientId),
      ctx.db
        .query("contracts")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("proposals")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("invoices")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("eventTimelineActivities")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("eventAssignments")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
    ]);

    const activeSelections = selections.filter(
      (selection) =>
        selection.tenantId === event.tenantId &&
        selection.deletedAt == null &&
        selection.removedAt == null &&
        selection.quantityServings > 0,
    );
    const resolvedSelections = (
      await Promise.all(
        activeSelections.map(async (selection) => {
          const dish = await ctx.db.get(selection.dishId);
          if (
            !dish ||
            dish.deletedAt != null ||
            dish.tenantId !== event.tenantId
          ) {
            return null;
          }
          return {
            selection,
            dish,
          };
        }),
      )
    )
      .filter((item) => item !== null)
      .sort(
        (left, right) =>
          (left.selection.addedAt ?? 0) - (right.selection.addedAt ?? 0) ||
          left.dish.name.localeCompare(right.dish.name),
      );
    const menu = resolvedSelections.map(({ selection, dish }) => ({
      id: String(selection._id),
      name: dish.name,
      description: dish.description ?? null,
      course: selection.course ?? dish.course ?? null,
      serviceStyle: selection.serviceStyle ?? dish.serviceStyle ?? null,
      quantityServings: selection.quantityServings,
    }));

    const organization =
      organizations.find(
        (candidate) =>
          candidate.deletedAt == null && candidate.status === "active",
      ) ?? organizations.find((candidate) => candidate.deletedAt == null);

    const clientRecord =
      client && client.deletedAt == null && client.tenantId === event.tenantId
        ? client
        : null;
    const documentClient = {
      clientType: clientRecord?.clientType ?? "company",
      companyName: clientRecord?.companyName ?? null,
      givenName: clientRecord?.givenName ?? null,
      familyName: clientRecord?.familyName ?? null,
      addressLine1: clientRecord?.addressLine1 ?? null,
      addressLine2: clientRecord?.addressLine2 ?? null,
      city: clientRecord?.city ?? null,
      region: clientRecord?.region ?? null,
      postalCode: clientRecord?.postalCode ?? null,
      countryCode: clientRecord?.countryCode ?? null,
      email: clientRecord?.email ?? null,
      taxId: clientRecord?.taxId ?? null,
      paymentTermsDays: clientRecord?.paymentTermsDays ?? 30,
      taxExempt: clientRecord?.taxExempt ?? false,
    };
    const clientName =
      documentClient.clientType === "person"
        ? [documentClient.givenName, documentClient.familyName]
            .filter(Boolean)
            .join(" ") || "Client"
        : documentClient.companyName?.trim() || "Client";

    const visibleContracts = contracts
      .filter(
        (contract) =>
          contract.tenantId === event.tenantId &&
          contract.clientId === event.clientId &&
          contract.deletedAt == null &&
          contract.status === "signed",
      )
      .sort(
        (left, right) =>
          Number(right.signedAt ?? right.createdAt ?? 0) -
          Number(left.signedAt ?? left.createdAt ?? 0),
      )
      .map((contract) => ({
        _id: String(contract._id),
        contractNumber: contract.contractNumber ?? null,
        title: contract.title,
        expiresAt: contract.expiresAt ?? null,
        signedAt: contract.signedAt ?? null,
        signedBy: contract.signedBy ?? null,
        notes: contract.notes ?? null,
      }));
    const acceptedProposals = proposals
      .filter(
        (proposal) =>
          proposal.tenantId === event.tenantId &&
          proposal.clientId === event.clientId &&
          proposal.deletedAt == null &&
          proposal.status === "accepted",
      )
      .sort(
        (left, right) =>
          Number(right.acceptedAt ?? right.createdAt ?? 0) -
          Number(left.acceptedAt ?? left.createdAt ?? 0),
      );
    // Spec §4.2 / §5.4: priced breakdown for the client-facing PDF. Lines are
    // fetched per accepted proposal via by_proposalId (bounded — never a
    // tenant-wide scan that could blow past Convex read limits), and the stored
    // amount is carried so the client sees the frozen accepted terms (accepted
    // proposals are immutable: line commands guard status == "draft"). Only
    // client-safe fields are projected; internal cost/margin and the
    // override-audit fields (menuDishId/overrideReason) stay private.
    const pricingLinesByProposal = new Map(
      await Promise.all(
        acceptedProposals.map(async (proposal) => {
          const lines = (
            await ctx.db
              .query("proposalLineItems")
              .withIndex("by_proposalId", (q) =>
                q.eq("proposalId", proposal._id),
              )
              .collect()
          )
            .filter((line) => line.deletedAt == null)
            .sort(
              (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
            )
            .map((line) => ({
              description: line.description,
              pricingBasis: line.pricingBasis,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              unit: line.unit ?? null,
              amount: line.amount,
            }));
          return [String(proposal._id), lines] as const;
        }),
      ),
    );
    const visibleProposals = acceptedProposals.map((proposal) => ({
      _id: String(proposal._id),
      proposalNumber: proposal.proposalNumber ?? null,
      title: proposal.title,
      eventDate: proposal.eventDate ?? null,
      eventType: proposal.eventType ?? null,
      guestCount: proposal.guestCount,
      venueName: proposal.venueName ?? null,
      venueAddress: proposal.venueAddress ?? null,
      subtotal: proposal.subtotal,
      taxAmount: proposal.taxAmount,
      discountAmount: proposal.discountAmount,
      total: proposal.total,
      expiresAt: proposal.expiresAt ?? null,
      notes: proposal.notes ?? null,
      terms: proposal.terms ?? null,
      pricingLines: pricingLinesByProposal.get(String(proposal._id)) ?? [],
      acceptedAt: proposal.acceptedAt ?? null,
    }));
    const visibleInvoices = invoices
      .filter(
        (invoice) =>
          invoice.tenantId === event.tenantId &&
          invoice.clientId === event.clientId &&
          invoice.deletedAt == null &&
          CLIENT_VISIBLE_INVOICE_STATUSES.has(invoice.status),
      )
      .sort(
        (left, right) =>
          Number(right.issuedAt ?? right.createdAt ?? 0) -
          Number(left.issuedAt ?? left.createdAt ?? 0),
      )
      .map((invoice) => ({
        _id: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber ?? null,
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        discountAmount: invoice.discountAmount,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        amountDue: invoice.amountDue,
        paymentTermsDays: invoice.paymentTermsDays,
        depositAmount: invoice.depositAmount ?? null,
        depositPaidAt: invoice.depositPaidAt ?? null,
        dueDate: invoice.dueDate ?? null,
        notes: invoice.notes ?? null,
        status: invoice.status,
        issuedAt: invoice.issuedAt ?? null,
        createdAt: invoice.createdAt ?? null,
      }));

    const timeline = timelineActivities
      .filter(
        (activity) =>
          activity.tenantId === event.tenantId &&
          activity.deletedAt == null &&
          activity.scheduledAt != null,
      )
      .map((activity) => ({
        name: activity.name,
        startsAt: activity.startsAt ?? null,
        endsAt: activity.endsAt ?? null,
        responsibleParty: activity.responsibleParty ?? null,
        notes: activity.notes ?? null,
      }));
    const staff = await Promise.all(
      eventAssignments
        .filter(
          (assignment) =>
            assignment.tenantId === event.tenantId &&
            assignment.deletedAt == null &&
            assignment.status !== "unassigned",
        )
        .map(async (assignment) => {
          const person = await ctx.db.get(assignment.personId);
          return {
            assignment: {
              role: assignment.role,
              startsAt: assignment.startsAt ?? null,
              endsAt: assignment.endsAt ?? null,
              notes: assignment.notes ?? null,
              status: assignment.status,
            },
            person:
              person &&
              person.tenantId === event.tenantId &&
              person.deletedAt == null
                ? {
                    givenName: person.givenName,
                    familyName: person.familyName,
                  }
                : null,
          };
        }),
    );

    return {
      organization: {
        displayName:
          organization?.brandDisplayName?.trim() ||
          organization?.name.trim() ||
          "Catering company",
        address: organization?.brandAddress?.trim() || null,
        primaryColor: organization?.brandPrimaryColor ?? null,
        accentColor: organization?.brandAccentColor ?? null,
      },
      event: {
        title: event.title,
        eventType: event.eventType,
        startsAt: event.startsAt ?? null,
        endsAt: event.endsAt ?? null,
        expectedHeadcount: event.expectedHeadcount,
        stage: event.stage,
      },
      menu,
      documents: {
        client: documentClient,
        clientName,
        contracts: visibleContracts,
        proposals: visibleProposals,
        invoices: visibleInvoices,
        beo: {
          event: {
            _id: String(event._id),
            stage: event.stage,
            title: event.title,
            primaryContactName: event.primaryContactName ?? null,
            startsAt: event.startsAt ?? null,
            endsAt: event.endsAt ?? null,
            expectedHeadcount: event.expectedHeadcount,
            eventType: event.eventType,
            venueName: event.venueName ?? null,
            venueAddress: event.venueAddress ?? null,
            quotedPrice: event.quotedPrice ?? null,
            serviceRequirements: event.serviceRequirements ?? null,
            operationalRequirements: event.operationalRequirements ?? null,
            accessibilityNeeds: event.accessibilityNeeds ?? [],
          },
          dishes: resolvedSelections.map(({ selection, dish }) => ({
            selection: {
              course: selection.course ?? null,
              quantityServings: selection.quantityServings,
              serviceStyle: selection.serviceStyle ?? null,
              specialInstructions: selection.specialInstructions ?? null,
            },
            dish: {
              course: dish.course ?? null,
              name: dish.name,
            },
          })),
          timeline,
          staff,
        },
      },
    };
  },
});
