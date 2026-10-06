// PL-CUTOVER: the one switch check. The checklist the page shows and the go
// step both read this, so the page can never say "ready" while go refuses
// (or the other way round). Spec §6.6 (CF-6.6-01..06) and BE-16.4.
//
// No fixed age rule (AC-287): the last import of every dataset must have
// finished, and must have started after the moment TPP stopped taking new
// entries (sourceFrozenAt). That is the source's own as-of evidence.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { evaluateProviderReadiness } from "./cutoverProviders";

type Db = QueryCtx["db"];

export interface CutoverCheck {
  passed: boolean;
  message: string;
  details?: string;
  count?: number;
  hasPlan?: boolean;
}

/** One thing still in the way of the switch, with where to fix it. */
export interface CutoverOpenItem {
  kind: "unmatched_link" | "field_difference" | "comparison_difference";
  id: string;
  recordType: string;
  externalId: string;
  capsuleEntity: string;
  capsuleId: string;
  field?: string;
}

export interface CutoverGate {
  canProceed: boolean;
  checks: {
    finalDeltaImport: CutoverCheck;
    zeroCriticalMappings: CutoverCheck;
    businessValidation: CutoverCheck;
    providerReadiness: CutoverCheck;
    rollbackPlan: CutoverCheck;
    openingStock: CutoverCheck;
    financialMode: CutoverCheck;
    backup: CutoverCheck;
  };
  blockers: string[];
  warnings: string[];
  openItems: CutoverOpenItem[];
  /** Newest completed run per dataset; stamped on the decision at go. */
  finalImportRunIds: Record<string, string>;
}

const DATASET_WORDS: Record<string, string> = {
  events: "events",
  contacts: "contacts",
  leads: "leads",
  menus: "menus",
  venues: "venues",
  payments: "payments",
  pack_list: "pack lists",
  stock: "stock",
  history: "messages and tasks",
};

/**
 * #425: every caterer has clients and events in TPP, so the switch waits
 * until both were imported. The other TPP lists may be unused by a
 * caterer, so a missing one is a warning, not a stop.
 */
const REQUIRED_DATASETS = ["contacts", "events"] as const;
const EXPECTED_DATASETS = [
  "menus",
  "venues",
  "leads",
  "payments",
  "pack_list",
] as const;

const OPEN_ITEM_SAMPLE = 25;

/** The workspace's one switch decision (oldest row wins, as before). */
export async function cutoverDecisionOf(
  db: Db,
  tenantId: string,
): Promise<Doc<"cutoverDecisions"> | null> {
  return await db
    .query("cutoverDecisions")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .first();
}

/**
 * A TPP item still waiting for a person (AC-288): exactly the match-up
 * page's queue (conflictStatus pending_conflict), unless someone checked it.
 * Every imported link starts unverified, so "unverified" alone would block
 * the switch on thousands of rows no screen lists; a resolved link carries
 * its disposition (matched by the import, or skipped with a note) and a
 * superseded one was replaced.
 */
export function isOpenTppLink(link: Doc<"externalRecordLinks">): boolean {
  return (
    link.sourceSystem === "tpp_legacy" &&
    link.deletedAt == null &&
    link.conflictStatus === "pending_conflict" &&
    link.verified !== true
  );
}

function runTime(run: Doc<"importRuns">): number {
  return run.startTime ?? run._creationTime;
}

async function finalImportCheck(
  db: Db,
  tenantId: string,
  sourceFrozenAt: number | null,
  blockers: string[],
  warnings: string[],
): Promise<{ check: CutoverCheck; runIds: Record<string, string> }> {
  const runs = await db
    .query("importRuns")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const newest = new Map<string, Doc<"importRuns">>();
  for (const run of runs) {
    if (run.deletedAt != null) continue;
    const current = newest.get(run.datasetType);
    if (!current || runTime(run) >= runTime(current)) {
      newest.set(run.datasetType, run);
    }
  }
  const runIds: Record<string, string> = {};
  if (newest.size === 0) {
    blockers.push("No imports have been finished");
    return {
      check: {
        passed: false,
        message: "No imports found",
        details: "At least one finished import is required",
      },
      runIds,
    };
  }

  const problems: string[] = [];
  for (const dataset of REQUIRED_DATASETS) {
    if (!newest.has(dataset)) {
      problems.push(
        `TPP ${DATASET_WORDS[dataset]} were never imported. Import them before the switch.`,
      );
    }
  }
  for (const dataset of EXPECTED_DATASETS) {
    if (!newest.has(dataset)) {
      warnings.push(
        `TPP ${DATASET_WORDS[dataset]} were never imported. Fine if you never kept them in TPP.`,
      );
    }
  }
  let firstUnfinished: Doc<"importRuns"> | null = null;
  for (const [dataset, run] of newest) {
    const words = DATASET_WORDS[dataset] ?? dataset;
    if (run.status !== "completed") {
      firstUnfinished ??= run;
      problems.push(`The latest ${words} import is ${run.status}.`);
      continue;
    }
    if (sourceFrozenAt != null && runTime(run) < sourceFrozenAt) {
      problems.push(
        `The last ${words} import ran before TPP stopped taking new entries. Import ${words} once more.`,
      );
      continue;
    }
    runIds[dataset] = String(run._id);
  }
  if (sourceFrozenAt == null) {
    problems.push(
      "Say when TPP stopped taking new entries, so Capsule knows the last import has everything.",
    );
  }
  blockers.push(...problems);

  if (firstUnfinished && problems.length > 0) {
    return {
      check: {
        passed: false,
        message: `Latest import is ${firstUnfinished.status}`,
        details: `Import ID: ${firstUnfinished._id}`,
      },
      runIds,
    };
  }
  if (problems.length > 0) {
    return {
      check: {
        passed: false,
        message: "One more import is needed",
        details: problems.join(" "),
      },
      runIds,
    };
  }
  return {
    check: {
      passed: true,
      message: "Every dataset was imported after TPP stopped taking entries",
      details: `${newest.size} dataset(s) up to date`,
    },
    runIds,
  };
}

async function openItemsCheck(
  db: Db,
  tenantId: string,
  blockers: string[],
  warnings: string[],
): Promise<{ check: CutoverCheck; items: CutoverOpenItem[] }> {
  // Only waiting links can be open (isOpenTppLink); reading every link of
  // the company timed out once the archive imports landed (2026-10-06).
  const links = await db
    .query("externalRecordLinks")
    .withIndex("by_tenantId_and_conflictStatus", (q) =>
      q.eq("tenantId", tenantId).eq("conflictStatus", "pending_conflict"),
    )
    .collect();
  const unmatched = links.filter(isOpenTppLink);
  // A field the import and a person both changed waits for a person to say
  // which value stays (keep Capsule's / take TPP's); that choice is the
  // accepted disposition. A pending one is still open.
  const conflicts = (
    await db
      .query("importConflicts")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter((row) => row.deletedAt == null && row.status === "pending");
  // A difference the daily TPP comparison found is settled when a person
  // says one system was fixed or the difference is fine (AC-286, AC-632).
  const differences = (
    await db
      .query("parallelRunDifferences")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter((row) => row.deletedAt == null && row.status === "open");
  const linkById = new Map(links.map((link) => [String(link._id), link]));

  const items: CutoverOpenItem[] = [];
  for (const link of unmatched.slice(0, OPEN_ITEM_SAMPLE)) {
    items.push({
      kind: "unmatched_link",
      id: String(link._id),
      recordType: link.recordType,
      externalId: link.externalId,
      capsuleEntity: link.capsuleEntity,
      capsuleId: link.capsuleId,
    });
  }
  for (const conflict of conflicts.slice(0, OPEN_ITEM_SAMPLE)) {
    const link = linkById.get(String(conflict.externalRecordLinkId));
    items.push({
      kind: "field_difference",
      id: String(conflict._id),
      recordType: link?.recordType ?? "record",
      externalId: link?.externalId ?? "",
      capsuleEntity: link?.capsuleEntity ?? "",
      capsuleId: link?.capsuleId ?? "",
      field: conflict.field,
    });
  }

  for (const difference of differences.slice(0, OPEN_ITEM_SAMPLE)) {
    const link = linkById.get(String(difference.externalRecordLinkId));
    items.push({
      kind: "comparison_difference",
      id: String(difference._id),
      recordType: link?.recordType ?? "event",
      externalId: difference.externalId,
      capsuleEntity: difference.capsuleEntity,
      capsuleId: difference.capsuleId,
      field: difference.field,
    });
  }

  const count = unmatched.length + conflicts.length + differences.length;
  if (unmatched.length > 0) {
    blockers.push(`${unmatched.length} leftover TPP items still need matching`);
    warnings.push("Use the match-up page to finish leftover TPP items");
  }
  if (conflicts.length > 0) {
    blockers.push(
      `${conflicts.length} imported field(s) differ from Capsule and need a person to pick which value stays`,
    );
  }
  if (differences.length > 0) {
    blockers.push(
      `${differences.length} difference(s) from the daily TPP comparison are not settled yet`,
    );
    warnings.push("Settle them on the Compare with TPP page");
  }
  return {
    check: {
      passed: count === 0,
      message:
        count === 0
          ? "Every leftover TPP item is matched up"
          : `${count} leftover TPP items still need matching`,
      count,
    },
    items,
  };
}

async function openingStockCheck(
  db: Db,
  tenantId: string,
  decision: Doc<"cutoverDecisions"> | null,
  blockers: string[],
  warnings: string[],
): Promise<CutoverCheck> {
  const waiting = (
    await db
      .query("openingStockRecords")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter((row) => row.deletedAt == null && row.status === "needs_review");
  if (waiting.length > 0) {
    warnings.push(
      `${waiting.length} opening stock line(s) still wait for review; they are not in the confirmed count.`,
    );
  }
  if (decision?.openingStockAsOf == null) {
    blockers.push("Confirm the opening stock date and count");
    return {
      passed: false,
      message: "Opening stock is not confirmed yet",
    };
  }
  return {
    passed: true,
    message: `Opening stock confirmed as of ${new Date(decision.openingStockAsOf).toISOString().slice(0, 10)}`,
    details: `${decision.openingStockCount ?? 0} counted line(s)`,
  };
}

/**
 * Every switch check of the workspace. The caller has already confirmed the
 * reader may see import and connection details.
 */
export async function evaluateCutoverGate(
  db: Db,
  tenantId: string,
): Promise<CutoverGate> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const decision = await cutoverDecisionOf(db, tenantId);

  const finalImport = await finalImportCheck(
    db,
    tenantId,
    decision?.sourceFrozenAt ?? null,
    blockers,
    warnings,
  );
  const open = await openItemsCheck(db, tenantId, blockers, warnings);

  const signedOff =
    decision?.businessApproved === true &&
    decision.businessApprovedById != null &&
    (decision.businessEvidence ?? "").trim().length > 0;
  if (!signedOff) {
    blockers.push("A manager still needs to sign off on this switch");
  }
  const businessValidation: CutoverCheck = {
    passed: signedOff,
    message: signedOff
      ? "A manager has signed off"
      : "A manager still needs to sign off",
    details: signedOff ? `Checked: ${decision?.businessEvidence}` : undefined,
  };

  const providers = await evaluateProviderReadiness(db, tenantId);
  blockers.push(...providers.blockers);
  warnings.push(...providers.warnings);

  const hasPlan = (decision?.rollbackPlan ?? "").trim().length > 0;
  if (!hasPlan) blockers.push("Write the switch-back plan before you switch");

  const openingStock = await openingStockCheck(
    db,
    tenantId,
    decision,
    blockers,
    warnings,
  );

  const mode = decision?.financialMode ?? null;
  if (mode == null) {
    blockers.push(
      "Choose how old invoices and payments come over: kept for reference, or rebuilt as Capsule records",
    );
  }

  const hasBackup = (decision?.backupEvidence ?? "").trim().length > 0;
  if (!hasBackup) {
    blockers.push("Say where the backup is and when a restore was tried");
  }

  return {
    canProceed: blockers.length === 0,
    checks: {
      finalDeltaImport: finalImport.check,
      zeroCriticalMappings: open.check,
      businessValidation,
      providerReadiness: {
        passed: providers.passed,
        message: providers.message,
      },
      rollbackPlan: {
        passed: hasPlan,
        message: hasPlan
          ? "Switch-back plan is written"
          : "No switch-back plan written yet",
        hasPlan,
      },
      openingStock,
      financialMode: {
        passed: mode != null,
        message:
          mode === "reference_history"
            ? "Old invoices and payments are kept for reference"
            : mode === "ledger_reconstruction"
              ? "Old invoices and payments are rebuilt as Capsule records"
              : "Money records: not chosen yet",
      },
      backup: {
        passed: hasBackup,
        message: hasBackup
          ? "Backup and restore are written down"
          : "No backup written down yet",
        details: hasBackup ? (decision?.backupEvidence ?? undefined) : undefined,
      },
    },
    blockers,
    warnings,
    openItems: open.items,
    finalImportRunIds: finalImport.runIds,
  };
}
