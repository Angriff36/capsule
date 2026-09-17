const SAMPLE_LIMIT = 10;

function sampleLines(label: string, paths: string[]): string[] {
  if (paths.length === 0) {
    return [];
  }
  const lines = [`  ${label} (${String(paths.length)}):`];
  for (const path of paths.slice(0, SAMPLE_LIMIT)) {
    lines.push(`    - ${path}`);
  }
  if (paths.length > SAMPLE_LIMIT) {
    lines.push(`    … and ${String(paths.length - SAMPLE_LIMIT)} more`);
  }
  return lines;
}

export interface GenerateConvexPlanSummary {
  mode: string;
  targetDir: string;
  compiledFrom: string;
  additions: string[];
  modifications: string[];
  deletions: string[];
  ledgerRepairs?: string[];
  conflicts: Array<{ path: string; reason: string; message: string }>;
  dependencyRequirementsChanged: boolean;
  followUps: Array<{ kind: string; message: string }>;
  assemblyComplete: boolean;
  assemblyErrorCount: number;
}

export function formatGenerateConvexDryRun(
  summary: GenerateConvexPlanSummary,
): string {
  const ledgerRepairs = summary.ledgerRepairs ?? [];
  const lines = [
    "Builder dry run — no files written",
    `Target: ${summary.targetDir}`,
    `Compiled from: ${summary.compiledFrom}`,
    `Mode: ${summary.mode}`,
    "",
    "Plan:",
    `  + ${String(summary.additions.length)} additions`,
    `  ~ ${String(summary.modifications.length)} modifications`,
    `  - ${String(summary.deletions.length)} deletions`,
    `  ≈ ${String(ledgerRepairs.length)} safe ledger repairs`,
    `  ! ${String(summary.conflicts.length)} conflicts`,
  ];

  lines.push(...sampleLines("Additions", summary.additions));
  lines.push(...sampleLines("Modifications", summary.modifications));
  lines.push(...sampleLines("Deletions", summary.deletions));
  lines.push(...sampleLines("Safe ledger repairs", ledgerRepairs));

  if (summary.conflicts.length > 0) {
    lines.push("", "Conflicts:");
    for (const conflict of summary.conflicts.slice(0, SAMPLE_LIMIT)) {
      // Three-way diagnostics are multi-line; indent the full message.
      const messageLines = conflict.message.split("\n");
      lines.push(`  - ${conflict.path}:`);
      for (const messageLine of messageLines) {
        lines.push(`      ${messageLine}`);
      }
    }
    if (summary.conflicts.length > SAMPLE_LIMIT) {
      lines.push(
        `  … and ${String(summary.conflicts.length - SAMPLE_LIMIT)} more`,
      );
    }
  }

  if (summary.dependencyRequirementsChanged) {
    lines.push(
      "",
      "Package requirements would change (use --install with --apply).",
    );
  }

  if (summary.followUps.length > 0) {
    lines.push("", "Follow-ups after apply:");
    for (const followUp of summary.followUps) {
      lines.push(`  - ${followUp.kind}: ${followUp.message}`);
    }
  }

  if (!summary.assemblyComplete || summary.assemblyErrorCount > 0) {
    lines.push(
      "",
      `Assembly incomplete (${String(summary.assemblyErrorCount)} error(s)).`,
    );
  }

  lines.push("");
  if (summary.conflicts.length > 0) {
    lines.push(
      "Conflicts block apply. Inspect the three-way diffs above.",
      "Do not hand-edit `.builder/ownership.json`.",
      "Do not blind-adopt ownership when the candidate does not match disk.",
      "Safe ledger repair runs automatically when disk already equals the fresh candidate.",
    );
  } else {
    lines.push(
      "Re-run with --apply to write this plan. Add --json for the full machine-readable plan.",
    );
  }

  return lines.join("\n");
}

export interface MigratePlanSummary {
  fromDir: string;
  targetDir: string;
  additions: string[];
  unchanged: string[];
  conflicts: string[];
}

export function formatMigrateDryRun(summary: MigratePlanSummary): string {
  const lines = [
    "Builder dry run — no files written",
    `From: ${summary.fromDir}`,
    `Target: ${summary.targetDir}`,
    "",
    "Plan:",
    `  + ${String(summary.additions.length)} additions`,
    `  = ${String(summary.unchanged.length)} unchanged`,
    `  ! ${String(summary.conflicts.length)} conflicts`,
  ];
  lines.push(...sampleLines("Additions", summary.additions));
  if (summary.conflicts.length > 0) {
    lines.push("", "Conflicts:");
    for (const path of summary.conflicts.slice(0, SAMPLE_LIMIT)) {
      lines.push(`  - ${path}`);
    }
  }
  lines.push("");
  lines.push(
    summary.conflicts.length > 0
      ? "Conflicts block apply. Resolve them, then re-run with --apply."
      : "Re-run with --apply to import editable Manifest source.",
  );
  return lines.join("\n");
}

export interface AdoptPlanSummary {
  targetDir: string;
  adoptedCount: number;
  identicalCount: number;
  baselinedCount: number;
  digestOnlyCount?: number;
  baselineRejected?: string[];
  unprovenExisting: number;
}

export function formatAdoptDryRun(summary: AdoptPlanSummary): string {
  const digestOnly = summary.digestOnlyCount ?? 0;
  const rejected = summary.baselineRejected ?? [];
  const lines = [
    "Builder dry run — no files written",
    `Target: ${summary.targetDir}`,
    "",
    "Plan:",
    `  adopt ${String(summary.adoptedCount)} proven generated path(s)`,
    `  (${String(summary.identicalCount)} identical, ${String(summary.baselinedCount)} baselined, ${String(digestOnly)} digest-only)`,
    `  ${String(summary.unprovenExisting)} unproven existing path(s) left app-owned`,
  ];
  if (rejected.length > 0) {
    lines.push(
      "",
      "Ownership policy: refused baselined:true on stock generated surfaces:",
    );
    for (const path of rejected.slice(0, SAMPLE_LIMIT)) {
      lines.push(`  - ${path}`);
    }
    lines.push(
      "Only declared author seams may be baselined (convex/lib/authContext.ts).",
      "Digest-only claims let the next regen overwrite stock paths.",
    );
  }
  lines.push("", "Re-run with --apply to write .builder/ownership.json only.");
  return lines.join("\n");
}
