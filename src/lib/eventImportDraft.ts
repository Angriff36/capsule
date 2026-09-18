import { z } from "zod";

const text = z.string().nullable().optional();
const amount = z.number().finite().nonnegative().nullable().optional();

/** Source facts, never catalog IDs or guessed operational defaults. */
export const eventImportFactsSchema = z.object({
  title: text,
  invoiceNumber: text,
  eventType: text,
  eventDate: text,
  startsAt: text,
  endsAt: text,
  expectedHeadcount: amount,
  clientName: text,
  primaryContactName: text,
  primaryContactEmail: text,
  primaryContactPhone: text,
  venueName: text,
  venueAddress: text,
  budgetAmount: amount,
  quotedPrice: amount,
  serviceRequirements: text,
  operationalRequirements: text,
  staffing: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  timeline: z.array(z.string()).optional(),
  otherNotes: z.array(z.string()).optional(),
  discrepancies: z.array(z.string()).optional(),
  menu: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: amount,
        unit: text,
        instructions: text,
        course: text,
      }),
    )
    .optional(),
});

export type EventImportFacts = z.infer<typeof eventImportFactsSchema>;
export interface EventImportSource {
  storageId: string;
  name: string;
  fingerprint?: string;
  mime?: string;
  fileSize?: number;
  attachmentId?: string;
}
export interface EventImportMenuLine {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  instructions?: string | null;
  course?: string | null;
  status: "unresolved" | "linked";
  reason?: string;
  dishId?: string;
  eventDishId?: string;
}
export interface EventImportDraft {
  version: 1;
  sourceKey: string;
  sources: EventImportSource[];
  sourceText?: string;
  facts: EventImportFacts;
  menu: EventImportMenuLine[];
  missing: string[];
  issues: string[];
  status: "saved" | "matching" | "complete" | "needs-review";
}

export function parseEventImportDraft(value: unknown): EventImportDraft | null {
  if (typeof value !== "string") return null;
  try {
    const result = z
      .object({
        version: z.literal(1),
        sourceKey: z.string(),
        sources: z.array(
          z.object({
            storageId: z.string(),
            name: z.string(),
            fingerprint: z.string().optional(),
            mime: z.string().optional(),
            fileSize: z.number().int().nonnegative().optional(),
            attachmentId: z.string().optional(),
          }),
        ),
        sourceText: z.string().optional(),
        facts: eventImportFactsSchema,
        menu: z.array(
          z.object({
            name: z.string().min(1),
            quantity: amount,
            unit: text,
            instructions: text,
            course: text,
            status: z.enum(["unresolved", "linked"]),
            reason: z.string().optional(),
            dishId: z.string().optional(),
            eventDishId: z.string().optional(),
          }),
        ),
        missing: z.array(z.string()),
        issues: z.array(z.string()),
        status: z.enum(["saved", "matching", "complete", "needs-review"]),
      })
      .safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function missingImportFacts(facts: EventImportFacts): string[] {
  return [
    "clientName",
    "eventDate",
    "startsAt",
    "endsAt",
    "expectedHeadcount",
    "primaryContactName",
    "venueName",
    "budgetAmount",
    "quotedPrice",
  ].filter((key) => {
    const value = facts[key as keyof EventImportFacts];
    return value == null || value === "";
  });
}
