/** One structured extraction, followed by deterministic, resumable writes. */
export const eventImportTool = {
  name: "save_event_from_beo",
  definition: {
    type: "function" as const,
    function: {
      name: "save_event_from_beo",
      description: "Save an event draft from the user's BEO or event document. Call FIRST after extracting facts, without listing catalogs or creating clients/events individually. Missing or conflicting facts must be omitted/null, never guessed or zero-filled. Preserves source files and every menu line; matches records and resumes previous progress automatically. Does not approve or finalize the event.",
      parameters: {
        type: "object" as const,
        required: [] as string[],
        properties: {
          resumeEventId: { type: "string", description: "For any continuation/retry, the eventId from the previous import receipt. Loads its saved source and progress instead of creating another event." },
          resumePreviousImport: { type: "boolean", description: "Use true to retry this conversation's previous import if its response was lost and no eventId is available. Never use for a new BEO." },
          ...Object.fromEntries([
            "title", "invoiceNumber", "eventType", "eventDate", "clientName",
            "primaryContactName", "primaryContactEmail", "primaryContactPhone",
            "venueName", "venueAddress", "serviceRequirements", "operationalRequirements",
          ].map((name) => [name, { type: "string", description: "Verbatim known source fact. Omit if absent or contradictory." }])),
          startsAt: { type: "string", description: "Full ISO date/time WITH timezone offset, only if established by source/context; otherwise leave blank and preserve printed date/time in eventDate/timeline." },
          endsAt: { type: "string", description: "Full ISO date/time WITH timezone offset if known. Never invent a duration." },
          expectedHeadcount: { type: "number", description: "Known guest count only; omit if missing." },
          budgetAmount: { type: "number", description: "Explicit budget in currency units. Missing is not zero." },
          quotedPrice: { type: "number", description: "Explicit quoted total in currency units. Missing is not zero." },
          ...Object.fromEntries(["staffing", "equipment", "timeline", "otherNotes", "discrepancies"].map((name) => [name, { type: "array", items: { type: "string" }, description: "All source details in this section, preserving quantities, units and instructions." }])),
          menu: {
            type: "array",
            description: "EVERY source menu line in source order, including unmatched items. Never substitute catalog IDs.",
            items: {
              type: "object", required: ["name"],
              properties: {
                name: { type: "string" }, quantity: { type: "number" },
                unit: { type: "string", description: "Original unit, e.g. servings, trays, each. Omit if absent; do not convert." },
                instructions: { type: "string" }, course: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  execution: { kind: "event-import" as const },
};
