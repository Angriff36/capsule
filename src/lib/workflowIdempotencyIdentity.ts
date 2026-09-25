/**
 * Backend spec §6.2 idempotency identities (AC-404).
 *
 * §6.2 needs ONE stable identity string per workflow entry class so a retry
 * can find the first result instead of writing a second Event, invoice,
 * order, prep task, pack line, reservation, payment, or historical source
 * record. Same inputs always produce the same string; different tenants,
 * parents, purposes, or classes never collide. Blank parts throw — a caller
 * never gets a silent default tenant, key, unit, or purpose.
 *
 * Encoding: a short class token, then the parts joined with the unit
 * separator "\u001f". Every string part is trim()ed then
 * encodeURIComponent()ed, so a separator or colon inside a part cannot
 * smash two identities together.
 *
 * Pure module — no I/O, no React, no Convex imports.
 */

export type WorkflowEntryClass =
  | "external_request"
  | "provider_webhook"
  | "import_record"
  | "reaction_child"
  | "weekly_purchase"
  | "event_generated_row";

export class WorkflowIdempotencyIdentity {
  private static readonly SEP = "\u001f";

  externalRequest(input: {
    tenantId: string;
    endpoint: string;
    key: string;
  }): string {
    return this.build("ext", {
      tenantId: input.tenantId,
      endpoint: input.endpoint,
      key: input.key,
    });
  }

  providerWebhook(input: {
    provider: string;
    connectionId: string;
    providerEventId: string;
  }): string {
    return this.build("hook", {
      provider: input.provider,
      connectionId: input.connectionId,
      providerEventId: input.providerEventId,
    });
  }

  importRecord(input: {
    tenantId: string;
    sourceSystem: string;
    artifactChecksum: string;
    sourceRecordId: string;
    parserVersion: string;
  }): string {
    return this.build("imp", {
      tenantId: input.tenantId,
      sourceSystem: input.sourceSystem,
      artifactChecksum: input.artifactChecksum,
      sourceRecordId: input.sourceRecordId,
      parserVersion: input.parserVersion,
    });
  }

  reactionChild(input: {
    tenantId: string;
    parentId: string;
    purpose: string;
    sourceKey: string;
  }): string {
    return this.build("rxn", {
      tenantId: input.tenantId,
      parentId: input.parentId,
      purpose: input.purpose,
      sourceKey: input.sourceKey,
    });
  }

  weeklyPurchase(input: {
    tenantId: string;
    weekStart: number;
    eventId: string;
    ingredientId: string;
    unit: string;
  }): string {
    if (
      typeof input.weekStart !== "number" ||
      !Number.isFinite(input.weekStart)
    ) {
      throw new Error("weekStart is required");
    }
    // §6.2 order: tenant + purchasing week + event + ingredient + unit.
    return this.build("week", {
      tenantId: input.tenantId,
      weekStart: String(input.weekStart),
      eventId: input.eventId,
      ingredientId: input.ingredientId,
      unit: input.unit,
    });
  }

  eventGeneratedRow(input: {
    tenantId: string;
    eventId: string;
    sourceLineId: string;
    purpose: string;
  }): string {
    return this.build("egen", {
      tenantId: input.tenantId,
      eventId: input.eventId,
      sourceLineId: input.sourceLineId,
      purpose: input.purpose,
    });
  }

  private build(token: string, parts: Record<string, string>): string {
    const encoded: string[] = [];
    for (const [field, value] of Object.entries(parts)) {
      const trimmed = typeof value === "string" ? value.trim() : "";
      if (!trimmed) throw new Error(`${field} is required`);
      encoded.push(encodeURIComponent(trimmed));
    }
    return [token, ...encoded].join(WorkflowIdempotencyIdentity.SEP);
  }
}

export const workflowIdempotencyIdentity = new WorkflowIdempotencyIdentity();
