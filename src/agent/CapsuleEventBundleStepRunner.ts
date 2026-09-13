import type { CapsuleCommandExecutor } from "./CapsuleCommandExecutor";
import type { PlannedStep } from "./CapsuleEventBundleShared";

/**
 * Runs a planned step sequence through an executor, threading each created
 * record id into the later steps that reference it. Transport-agnostic and
 * free of Node APIs, so the browser importer and the MCP coordinator share it.
 */

export interface StepRunProgress {
  /** Steps finished so far, including this one. */
  completed: number;
  total: number;
  step: PlannedStep;
}

export interface StepRunOptions {
  steps: readonly PlannedStep[];
  /** Ids that already exist, keyed by ref; created ids are added to a copy. */
  seedIds: Readonly<Record<string, string>>;
  executor: CapsuleCommandExecutor;
  /** `${scope}:${capabilityId}:${suffix}` in the coordinator. */
  idempotencyKeyFor: (step: PlannedStep) => string;
  onProgress?: (progress: StepRunProgress) => void;
}

export function asDocId(result: unknown): string {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    for (const field of ["docId", "_id", "id"]) {
      const value = record[field];
      if (typeof value === "string") return value;
    }
  }
  throw new Error("Command result carried no record id");
}

export function dropEmptyArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(args)) {
    if (value === undefined || value === "") continue;
    kept[name] = value;
  }
  return kept;
}

/** Replace step references with the ids the earlier steps produced. */
export function resolveStepArgs(
  step: PlannedStep,
  createdIds: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const args = { ...step.args };
  for (const name of step.resolveRefs ?? []) {
    const ref = args[name];
    if (typeof ref !== "string") continue;
    const id = createdIds[ref];
    if (id === undefined) {
      throw new Error(
        `Step "${step.label}" needs ${name} from "${ref}", which has not been created`,
      );
    }
    args[name] = id;
  }
  return args;
}

/** Execute every step in order. Returns all ids, seeded and created. */
export async function runPlannedSteps(
  options: StepRunOptions,
): Promise<Record<string, string>> {
  const createdIds: Record<string, string> = { ...options.seedIds };
  const total = options.steps.length;
  let completed = 0;
  for (const step of options.steps) {
    const args = resolveStepArgs(step, createdIds);
    const result = await options.executor.execute({
      capabilityId: step.capabilityId,
      args: dropEmptyArgs(args),
      idempotencyKey: options.idempotencyKeyFor(step),
    });
    createdIds[step.ref] = asDocId(result);
    completed += 1;
    options.onProgress?.({ completed, total, step });
  }
  return createdIds;
}
