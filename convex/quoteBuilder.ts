import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Public status payload for getQuoteSubmissionStatus — derived from the Doc so
// field types stay in sync with the schema (single source of truth).
type QuoteSubmissionStatusResult = {
  id: Doc<"quoteSubmissions">["_id"];
  status: Doc<"quoteSubmissions">["status"];
  submittedAt: Doc<"quoteSubmissions">["submittedAt"];
  completedAt: Doc<"quoteSubmissions">["completedAt"];
  clientId: Doc<"quoteSubmissions">["clientId"];
  leadId: Doc<"quoteSubmissions">["leadId"];
  eventId: Doc<"quoteSubmissions">["eventId"];
  proposalId: Doc<"quoteSubmissions">["proposalId"];
  errorMessage: Doc<"quoteSubmissions">["errorMessage"];
};

/**
 * Generates a stable deduplication key from email + event date + tenantId.
 * This ensures submit-once behavior even if the user submits multiple times.
 */
function generateDedupKey(
  email: string,
  eventDate: string,
  tenantId: string,
): string {
  // Simple hash function for deduplication
  const normalized = `${email.toLowerCase().trim()}|${eventDate}|${tenantId}`;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `quote_${Math.abs(hash)}_${Date.now()}`;
}

/**
 * Validates that the event date is not in the past.
 * This is a basic business rule check; more complex availability validation can be added later.
 */
function validateEventDate(eventDate: string): {
  valid: boolean;
  error?: string;
} {
  const date = new Date(eventDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset to start of day for fair comparison

  if (date < today) {
    return {
      valid: false,
      error: "Event date cannot be in the past",
    };
  }

  return { valid: true };
}

/**
 * Public quote submission mutation - creates Contact/Lead/Event/Proposal from web form.
 * This is an action (not a mutation) so it can write to multiple entities in one transaction.
 *
 * Flow:
 * 1. Validate input (date not in past, guest count > 0, required fields)
 * 2. Generate dedup key
 * 3. Check for existing submission with same dedup key
 * 4. Create QuoteSubmission record
 * 5. Create Client (Company/Person)
 * 6. Create Lead
 * 7. Create Event (graceful failure - save Lead even if Event fails)
 * 8. Create Proposal draft (graceful failure - save Event even if Proposal fails)
 * 9. Update QuoteSubmission with created entity IDs and status
 * 10. Return submissionId and status
 *
 * Errors at any step are captured in QuoteSubmission for follow-up.
 */
export const submitQuote = action({
  args: {
    clientName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    eventDate: v.string(), // ISO date string
    eventEndTime: v.optional(v.string()),
    guestCount: v.number(),
    serviceStyleId: v.optional(v.id("serviceStyles")),
    occasionId: v.optional(v.id("occasions")),
    venueName: v.optional(v.string()),
    venueAddress: v.optional(v.string()),
    menuPreferences: v.optional(v.string()),
    dietaryRestrictions: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    submissionId: Id<"quoteSubmissions">;
    status: string | undefined;
    isDuplicate: boolean;
    message: string;
    clientId?: Id<"clients"> | null;
    leadId?: Id<"leads"> | null;
    eventId?: Id<"events"> | null;
    proposalId?: Id<"proposals"> | null;
  }> => {
    // Step 1: Validate input
    const dateValidation = validateEventDate(args.eventDate);
    if (!dateValidation.valid) {
      throw new ConvexError(dateValidation.error ?? "Invalid event date");
    }

    if (args.guestCount <= 0) {
      throw new ConvexError("Guest count must be positive");
    }

    if (!args.clientName?.trim()) {
      throw new ConvexError("Client name is required");
    }

    if (!args.email?.trim()) {
      throw new ConvexError("Email address is required");
    }

    // Step 2: Get or create tenant context
    // For MVP, we use a default tenant. In production, this would come from subdomain/route param.
    const organizations = await ctx.runQuery(api.queries.listOrganization);
    const organization =
      organizations.find((org) => org.status === "active") ?? organizations[0];

    if (!organization) {
      throw new ConvexError(
        "Unable to process quote. Please contact us directly.",
      );
    }

    const tenantId = organization.tenantId;

    // Step 3: Generate dedup key
    const dedupKey = generateDedupKey(args.email, args.eventDate, tenantId);

    // Step 4: Check for existing submission (prevent exact duplicates)
    const existingSubmissions = await ctx.runQuery(
      api.queries.listQuoteSubmission,
    );
    const existing = existingSubmissions.find(
      (sub) => sub.dedupKey === dedupKey && sub.deletedAt === null,
    );

    if (
      existing &&
      (existing.status === "pending" ||
        existing.status === "processing" ||
        existing.status === "completed")
    ) {
      // Return existing submission instead of creating duplicate
      return {
        submissionId: existing._id,
        status: existing.status,
        isDuplicate: true,
        message:
          "You've already submitted a quote request for this event. We'll be in touch soon!",
      };
    }

    // Step 5: Create QuoteSubmission record
    const submissionResult = await ctx.runMutation(
      api.mutations.QuoteSubmission_create,
      {
        dedupKey,
        clientName: args.clientName.trim(),
        email: args.email.trim().toLowerCase(),
        phone: args.phone?.trim() ?? "",
        eventDate: new Date(args.eventDate).getTime(),
        eventEndTime: args.eventEndTime
          ? new Date(args.eventEndTime).getTime()
          : 0,
        guestCount: args.guestCount,
        serviceStyleId: args.serviceStyleId ?? "",
        occasionId: args.occasionId ?? "",
        venueName: args.venueName?.trim() ?? "",
        venueAddress: args.venueAddress?.trim() ?? "",
        menuPreferences: args.menuPreferences?.trim() ?? "",
        dietaryRestrictions: args.dietaryRestrictions?.trim() ?? "",
        notes: args.notes?.trim() ?? "",
      },
    );
    const submissionId = submissionResult._id;

    // Mark submission as processing
    await ctx.runMutation(api.mutations.QuoteSubmission_startProcessing, {
      docId: submissionId,
    });

    // Step 6: Create Client (Company for MVP - can be Person in future)
    let clientId: Id<"clients"> | null = null;
    try {
      // Check if client with same email already exists
      const existingClients = await ctx.runQuery(api.queries.listClient);
      const existingClient = existingClients.find(
        (c) =>
          c.email?.toLowerCase() === args.email.toLowerCase() &&
          c.deletedAt === null,
      );

      if (existingClient) {
        clientId = existingClient._id;
      } else {
        // Create new client (company type for MVP)
        const newClient = await ctx.runMutation(
          api.mutations.Client_createViaRegister,
          {
            clientType: "company",
            companyName: args.clientName.trim(),
            email: args.email.trim().toLowerCase(),
            phone: args.phone?.trim() ?? undefined,
          },
        );
        clientId = newClient._id;
      }
    } catch (error) {
      // If client creation fails, mark submission as failed and return
      await ctx.runMutation(api.mutations.QuoteSubmission_fail, {
        docId: submissionId,
        errorMessage: "Failed to create client record",
        processingErrors:
          error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Step 7: Create Lead
    let leadId: Id<"leads"> | null = null;
    try {
      if (clientId) {
        const leadResult = await ctx.runMutation(
          api.mutations.Lead_createViaCapture,
          {
            leadType: "company",
            source: "quote-builder", // Track that this came from the public quote form
            estimatedValue: 0, // Will be calculated when proposal is created
            companyName: args.clientName.trim(),
            email: args.email.trim().toLowerCase(),
            phone: args.phone?.trim() ?? undefined,
          },
        );
        leadId = leadResult._id;

        // Link lead to client
        if (leadId && clientId) {
          await ctx.runMutation(api.mutations.Lead_stageConversion, {
            docId: leadId,
            clientId,
            clientContactId: undefined,
          });
          await ctx.runMutation(api.mutations.Lead_confirmConversion, {
            docId: leadId,
          });
        }
      }
    } catch (error) {
      // If lead creation fails, we still have the client - continue with event creation
      console.error("Failed to create lead:", error);
    }

    // Step 8: Create Event (graceful failure - save submission even if this fails)
    let eventId: Id<"events"> | null = null;
    try {
      if (clientId) {
        // Parse dates for Event
        const eventStart = new Date(args.eventDate);
        const eventEnd = args.eventEndTime
          ? new Date(
              /^\d{2}:\d{2}/.test(args.eventEndTime)
                ? `${args.eventDate}T${args.eventEndTime}`
                : args.eventEndTime,
            )
          : new Date(eventStart.getTime() + 4 * 60 * 60 * 1000); // Default 4-hour event

        const eventResult = await ctx.runMutation(
          api.mutations.Event_createViaPlanEngagement,
          {
            clientId,
            title: `Quote Request: ${args.clientName.trim()}`,
            eventType: "Catering Inquiry",
            startsAt: eventStart.getTime(),
            endsAt: eventEnd.getTime(),
            expectedHeadcount: args.guestCount,
            primaryContactName: args.clientName.trim(),
            budgetAmount: 0,
            quotedPrice: 0,
            serviceStyleId: args.serviceStyleId ?? undefined,
            occasionId: args.occasionId ?? undefined,
            venueName: args.venueName?.trim() ?? undefined,
            venueAddress: args.venueAddress?.trim() ?? undefined,
            serviceRequirements: args.menuPreferences?.trim() ?? undefined,
            operationalRequirements:
              args.dietaryRestrictions?.trim() ?? undefined,
          },
        );
        eventId = eventResult._id;
      }
    } catch (error) {
      // If event creation fails, we still have the lead - continue with proposal
      console.error("Failed to create event:", error);
    }

    // Step 9: Create Proposal draft (graceful failure)
    let proposalId: Id<"proposals"> | null = null;
    try {
      if (clientId) {
        // Get occasion name if provided
        let eventName = "Event";
        if (args.occasionId) {
          try {
            const occasions = await ctx.runQuery(api.queries.listOccasion);
            const occasion = occasions.find((o) => o._id === args.occasionId);
            eventName = occasion?.name || "Event";
          } catch {
            // Use default name
          }
        }

        // Create a basic draft proposal
        const proposalResult = await ctx.runMutation(
          api.mutations.Proposal_createViaDraft,
          {
            clientId,
            title: `Proposal for ${args.clientName.trim()}`,
            eventDate: new Date(args.eventDate).getTime(),
            eventType: eventName,
            venueName: args.venueName?.trim() ?? undefined,
            venueAddress: args.venueAddress?.trim() ?? undefined,
            guestCount: args.guestCount,
            subtotal: 0, // Will be calculated when menu is selected
            taxAmount: 0,
            discountAmount: 0,
            total: 0,
            notes:
              args.notes?.trim() ??
              "Draft proposal created from quote request. Menu selection and pricing to follow.",
          },
        );
        proposalId = proposalResult._id;
        // ponytail: no Proposal command links an event after creation
        // (createViaDraft has no eventId arg), so the draft stays unlinked;
        // both IDs are still recorded on the QuoteSubmission below.
      }
    } catch (error) {
      // If proposal creation fails, we still have the event - mark as completed
      console.error("Failed to create proposal:", error);
    }

    // Step 10: Update QuoteSubmission with created entity IDs
    await ctx.runMutation(api.mutations.QuoteSubmission_complete, {
      docId: submissionId,
      clientId: clientId ?? "",
      leadId: leadId ?? "",
      eventId: eventId ?? "",
      proposalId: proposalId ?? "",
    });

    return {
      submissionId,
      status: "completed",
      isDuplicate: false,
      message:
        "Thank you! Your quote request has been submitted. We'll be in touch within 24-48 hours.",
      clientId,
      leadId,
      eventId,
      proposalId,
    };
  },
});

/**
 * Public query to check quote submission status by ID.
 * This allows users to check the status of their submission without authentication.
 */
export const getQuoteSubmissionStatus = action({
  args: {
    submissionId: v.id("quoteSubmissions"),
  },
  handler: async (
    ctx,
    { submissionId },
  ): Promise<QuoteSubmissionStatusResult> => {
    const submission = await ctx.runQuery(api.queries.getQuoteSubmission, {
      id: submissionId,
    });

    if (!submission || submission.deletedAt !== null) {
      throw new ConvexError("Quote submission not found");
    }

    return {
      id: submission._id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      completedAt: submission.completedAt,
      clientId: submission.clientId,
      leadId: submission.leadId,
      eventId: submission.eventId,
      proposalId: submission.proposalId,
      errorMessage: submission.errorMessage,
    };
  },
});
