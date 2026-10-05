// PL-SOURCE-DATASETS (AC-275, TPP_COMPANY_MAPPINGS): a company row of the
// contacts dataset becomes a company client, linked as recordType "company".
// People whose CompanyID names it carry its name, and events whose ClientID is
// a company id find their client through it.
import type { ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ParsedCapsuleContact } from "../tppParser";
import type { LookAlikeClient } from "./importIdentity";
import { skippedByPerson } from "./importResolution";
import { SOURCE_FIELD_MAPS, sourceVersionOf } from "./importSourceFields";
import { reconcileExistingLink, type DeltaOutcome } from "../importSourceDelta";

type SourceSystem = "tpp_legacy" | "csv_export" | "api_sync";

export const COMPANY_RECORD_TYPE = "company";

/**
 * Create the company client and its link. A company an earlier run made takes
 * a changed source row as a reviewed delta (PL-SOURCE-DELTA); one a person
 * skipped stays skipped.
 */
export async function commitImportedCompany(
  ctx: ActionCtx,
  args: {
    tenantId: string;
    sourceSystem: SourceSystem;
    importRunId: Id<"importRuns">;
    company: ParsedCapsuleContact;
    rawSourceData: string;
    /** PL-SOURCE-IDENTITY: why the new company may be one Capsule has. */
    lookAlike?: (made: LookAlikeClient) => Promise<string | null>;
  },
): Promise<"committed" | "skipped" | "pending" | DeltaOutcome> {
  const { company } = args;
  const details = company.company!;
  const existing = await ctx.runQuery(internal.importCommit.findLink, {
    tenantId: args.tenantId,
    sourceSystem: args.sourceSystem,
    recordType: COMPANY_RECORD_TYPE,
    externalId: company.externalId,
  });
  if (existing && (existing.capsuleId || skippedByPerson(existing))) {
    if (existing.sourceImportRunId === args.importRunId) return "resumed";
    if (!existing.capsuleId) return "skipped";
    return await reconcileExistingLink(ctx, {
      dataset: "companies",
      link: existing,
      record: company,
      rawSourceData: args.rawSourceData,
      importRunId: args.importRunId,
    });
  }
  const values = SOURCE_FIELD_MAPS.companies.fromSource(
    company as unknown as Record<string, unknown>,
  );
  const link = {
    tenantId: args.tenantId,
    sourceSystem: args.sourceSystem,
    recordType: COMPANY_RECORD_TYPE,
    externalId: company.externalId,
    capsuleEntity: "client" as const,
    sourceImportRunId: args.importRunId,
    rawSourceData: args.rawSourceData,
  };
  try {
    const created = await ctx.runMutation(
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: details.name,
        email: company.email,
        phone: company.phone,
        addressLine1: company.addressLine1,
        city: company.city,
        region: company.region,
        postalCode: company.postalCode,
        taxId: details.taxId,
        paymentTermsDays: details.paymentTermsDays,
        notes: company.notes,
        idempotencyKey: `tenant-shared/import:${args.importRunId}:company:${company.externalId}`,
      },
    );
    const capsuleId = (created as { docId: string }).docId;
    const lookAlikeNote = args.lookAlike
      ? await args.lookAlike({
          _id: capsuleId,
          clientType: "company",
          companyName: details.name,
        })
      : null;
    await ctx.runMutation(internal.importCommit.upsertLink, {
      ...link,
      capsuleId,
      appliedValues: JSON.stringify(values),
      sourceVersion: sourceVersionOf(values),
      ...(lookAlikeNote
        ? {
            conflictStatus: "pending_conflict" as const,
            resolutionNote: lookAlikeNote,
            madeRecord: true,
          }
        : { conflictStatus: "resolved" as const }),
    });
    // A look-alike is a made record; only its link waits on the match list.
    return "committed";
  } catch (cause) {
    await ctx.runMutation(internal.importCommit.upsertLink, {
      ...link,
      capsuleId: "",
      conflictStatus: "pending_conflict",
      resolutionNote:
        cause instanceof Error ? cause.message : "Company could not be added",
    });
    return "pending";
  }
}

/** The imported company's name, when its company row was imported. */
export async function importedCompanyName(
  ctx: ActionCtx,
  args: { tenantId: string; sourceSystem: SourceSystem; companyId: string },
): Promise<string | undefined> {
  const link = await ctx.runQuery(internal.importCommit.findLink, {
    tenantId: args.tenantId,
    sourceSystem: args.sourceSystem,
    recordType: COMPANY_RECORD_TYPE,
    externalId: args.companyId,
  });
  if (!link?.capsuleId) return undefined;
  try {
    const raw = JSON.parse(link.rawSourceData ?? "{}") as {
      company?: { name?: string };
    };
    return raw.company?.name || undefined;
  } catch {
    return undefined;
  }
}
