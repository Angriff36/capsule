// PL-IMPORT-RESUME (AC-024): an imported event's files (contract, BEO, floor
// plan) become Attachment rows on the new event. Each file has its own
// run-scoped key, so a resumed run never attaches a file twice and never puts
// back a file a person removed after the fault.
import type { ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ParsedEventFile } from "../tppParser";

export function importedEventFileKey(
  importRunId: string,
  externalId: string,
  fileIndex: number,
): string {
  return `tenant-shared/import:${importRunId}:event:${externalId}:file:${fileIndex}`;
}

/** Attach every file; returns one plain line per file that could not be added. */
export async function attachImportedEventFiles(
  ctx: ActionCtx,
  args: {
    tenantId: string;
    importRunId: string;
    externalId: string;
    eventId: string;
    files: ParsedEventFile[];
  },
): Promise<string[]> {
  const errors: string[] = [];
  for (const [fileIndex, file] of args.files.entries()) {
    try {
      // The same rule as an archive upload: the stored file must be this
      // company's fresh upload, never another company's record.
      const claim = await ctx.runQuery(
        internal.archiveInventoryStore.archiveStorageClaim,
        {
          tenantId: args.tenantId,
          storageId: file.storageId as Id<"_storage">,
        },
      );
      if (!claim.allowed) {
        errors.push(`${file.fileName}: ${claim.reason}`);
        continue;
      }
      await ctx.runMutation(api.mutations.Attachment_createViaAttach, {
        parentType: "eventRecord",
        parentId: args.eventId,
        fileName: file.fileName,
        contentType: file.contentType,
        fileSize: file.fileSize,
        storageId: file.storageId,
        idempotencyKey: importedEventFileKey(
          args.importRunId,
          args.externalId,
          fileIndex,
        ),
      });
    } catch (cause) {
      errors.push(
        `${file.fileName}: ${cause instanceof Error ? cause.message : "could not be added"}`,
      );
    }
  }
  return errors;
}
