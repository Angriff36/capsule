/**
 * Wiring inspection and repair — Manifest owns the analysis; Builder only orchestrates.
 */

import {
  buildWiringContract,
  inspectWiringConsumersSync,
  fileMapFromRecord,
  planWiringRepairs,
  verifyRepair,
  type WiringContract,
  type WiringInspectConfig,
  type WiringInspectReport,
  type RepairPlan,
  type RepairPlanBundle,
  type ContractMismatch,
} from "@angriff36/manifest/projections/wiring";
import type { IR } from "./types";

export type {
  WiringContract,
  WiringInspectConfig,
  WiringInspectReport,
  RepairPlan,
  RepairPlanBundle,
  ContractMismatch,
};

/** Return type of Manifest `verifyRepair` (not re-exported from the wiring entry). */
export type RepairVerificationResult = ReturnType<typeof verifyRepair>;

/** Build the machine-readable wiring contract from compiled IR. */
export function buildProjectWiringContract(ir: IR): WiringContract {
  return buildWiringContract(ir);
}

function defaultRoots(sources: Record<string, string>): string[] {
  const roots = new Set<string>();
  for (const path of Object.keys(sources)) {
    const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
    const top = normalized.split("/")[0];
    if (top) roots.add(top);
  }
  return roots.size > 0 ? [...roots].sort() : ["."];
}

export interface InspectProjectWiringInput {
  ir: IR;
  /** Application / consumer sources (path → contents). Not Manifest DSL alone. */
  sources: Record<string, string>;
  config?: Partial<WiringInspectConfig>;
}

/** Inspect whether application sources correctly consume wiring capabilities. */
export function inspectProjectWiring(
  input: InspectProjectWiringInput,
): WiringInspectReport {
  const contract = buildWiringContract(input.ir);
  const fileContents = fileMapFromRecord(input.sources);
  const config: WiringInspectConfig = {
    roots: input.config?.roots ?? defaultRoots(input.sources),
    framework: input.config?.framework ?? "nextjs-app-router",
    ...input.config,
  };
  return inspectWiringConsumersSync({ contract, fileContents, config });
}

export interface PlanProjectWiringRepairsInput extends InspectProjectWiringInput {
  report?: WiringInspectReport;
  capabilityId?: string;
}

/** Plan deterministic repairs from an inspect report (or a fresh inspect). */
export function planProjectWiringRepairs(
  input: PlanProjectWiringRepairsInput,
): {
  contract: WiringContract;
  report: WiringInspectReport;
  plans: RepairPlanBundle;
} {
  const contract = buildWiringContract(input.ir);
  const report = input.report ?? inspectProjectWiring(input);
  const fileContents = fileMapFromRecord(input.sources);
  const plans = planWiringRepairs({
    contract,
    report,
    fileContents,
    ...(input.capabilityId ? { capabilityId: input.capabilityId } : {}),
  });
  return { contract, report, plans };
}

export interface VerifyProjectWiringRepairInput {
  ir: IR;
  plan: RepairPlan;
  sources: Record<string, string>;
  config?: Partial<WiringInspectConfig>;
  baselineMismatches?: ContractMismatch[];
}

/** Re-inspect after a repair plan and verify the finding is resolved. */
export function verifyProjectWiringRepair(
  input: VerifyProjectWiringRepairInput,
): RepairVerificationResult {
  const contract = buildWiringContract(input.ir);
  const fileContents = fileMapFromRecord(input.sources);
  return verifyRepair(
    input.plan,
    contract,
    fileContents,
    input.config,
    input.baselineMismatches,
  );
}
