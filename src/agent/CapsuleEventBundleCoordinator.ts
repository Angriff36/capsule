import type { EventBundle } from "../lib/tppReports/eventBundle";
import {
  buildEventBundlePlan,
  type EventBundlePlan,
  type PlannedStep,
} from "./CapsuleEventBundlePlan";
import type { CapsuleCommandExecutor } from "./CapsuleCommandExecutor";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import { CapsuleIdempotencyKeyFactory } from "./CapsuleIdempotencyKeyFactory";

/**
 * Enters a whole TPP event bundle into Capsule through governed commands.
 *
 * Every write is a Manifest command — the same contract, guards and policies
 * the UI uses. Nothing here writes to a table. The run previews first, and
 * refuses to write while a warning is unacknowledged.
 */

export interface CapsuleEventBundleEnterOptions {
  bundle: EventBundle;
  /**
   * Required when the bundle carries warnings. Warnings mean the reports
   * disagreed or something could not be mapped; a human decides, not the agent.
   */
  acceptWarnings?: boolean;
  /** Overrides the idempotency scope. Defaults to the TPP invoice number. */
  idempotencyScope?: string;
  /**
   * Tenant records to match against. `existing` attaches the run to an event
   * that is already in Capsule; `directory` lets staff, vendors and
   * ingredients resolve to real records.
   */
  context?: CapsuleEventBundleContext;
}

export interface CapsuleEventBundlePreview {
  plan: EventBundlePlan;
  /** One line per step, in run order. */
  steps: Array<{ capabilityId: string; label: string }>;
  safeToEnterWithoutApproval: boolean;
}

export interface CapsuleEventBundleEnterResult {
  eventId: string;
  /** Local step reference to the created record id. */
  createdIds: Record<string, string>;
  executedSteps: number;
  idempotencyScope: string;
  warnings: string[];
}

function asDocId(result: unknown): string {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    for (const field of ["docId", "_id", "id"]) {
      const value = record[field];
      if (typeof value === "string") return value;
    }
  }
  throw new Error("Command result carried no record id");
}

function dropEmptyArgs(args: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(args)) {
    if (value === undefined || value === "") continue;
    kept[name] = value;
  }
  return kept;
}

/**
 * Warnings that report data left out of the event, or a value that was
 * guessed for it (an assumed start time); everything else is a note.
 */
const NEEDS_DECISION =
  /was skipped|were skipped|not entered|match no person|is assumed/;

export class CapsuleEventBundleCoordinator {
  constructor(private readonly executor: CapsuleCommandExecutor) {}

  /** What the run would do. Makes no calls. */
  preview(
    bundle: EventBundle,
    context: CapsuleEventBundleContext = {},
  ): CapsuleEventBundlePreview {
    const plan = buildEventBundlePlan(bundle, context);
    return {
      plan,
      steps: plan.steps.map((step) => ({
        capabilityId: step.capabilityId,
        label: step.label,
      })),
      safeToEnterWithoutApproval: plan.warnings.length === 0,
    };
  }

  async enter(
    options: CapsuleEventBundleEnterOptions,
  ): Promise<CapsuleEventBundleEnterResult> {
    const context = options.context ?? {};
    const plan = buildEventBundlePlan(options.bundle, context);
    if (plan.steps.length === 0 && context.existing === undefined) {
      throw new Error(
        `Nothing to enter. ${plan.warnings.join(" ") || "The bundle was empty."}`,
      );
    }
    // Only warnings that mean something was LEFT OUT need a decision. Notes
    // that merely describe what was entered (rounding, a second pack list on
    // approve, vendor-less lines) are reported, never gated on.
    const undecided = plan.warnings.filter((warning) =>
      NEEDS_DECISION.test(warning),
    );
    if (undecided.length > 0 && options.acceptWarnings !== true) {
      throw new Error(
        `Refusing to enter: ${undecided.length} warning(s) need a decision. ` +
          `Run the preview, check each warning, then enter with acceptWarnings ` +
          `(CLI: --accept-warnings).\n- ${undecided.join("\n- ")}`,
      );
    }

    // Without an invoice number, scope by the bundle's own identity so two
    // no-invoice imports never replay each other's idempotency results.
    const header = options.bundle.header;
    const scope =
      options.idempotencyScope ??
      (header.invoiceNumber
        ? `tpp:${header.invoiceNumber}`
        : `tpp:noinvoice:${header.eventDate ?? "nodate"}:${header.startMinutes ?? "notime"}:${header.guestCount ?? "noguests"}:${(header.title ?? "").trim().toLowerCase()}`);
    const keys = new CapsuleIdempotencyKeyFactory(scope);
    const createdIds: Record<string, string> = { ...plan.seedIds };

    for (const step of plan.steps) {
      const args = this.resolveArgs(step, createdIds);
      const result = await this.executor.execute({
        capabilityId: step.capabilityId,
        args: dropEmptyArgs(args),
        idempotencyKey: keys.forCapability(
          step.capabilityId,
          step.idempotencySuffix,
        ),
      });
      createdIds[step.ref] = asDocId(result);
    }

    const eventId = createdIds.event;
    if (eventId === undefined) throw new Error("The event was not created");

    return {
      eventId,
      createdIds,
      executedSteps: plan.steps.length,
      idempotencyScope: scope,
      warnings: plan.warnings,
    };
  }

  /** Replace step references with the ids the earlier steps produced. */
  private resolveArgs(
    step: PlannedStep,
    createdIds: Record<string, string>,
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
}
