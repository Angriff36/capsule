import type { EventBundle } from "../lib/tppReports/eventBundle";
import {
  buildEventBundlePlan,
  type EventBundlePlan,
} from "./CapsuleEventBundlePlan";
import type { CapsuleCommandExecutor } from "./CapsuleCommandExecutor";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import { eventBundleIdempotencyScope } from "./CapsuleEventBundleIdempotencyScope";
import { runPlannedSteps } from "./CapsuleEventBundleStepRunner";
import { warningsNeedingDecision } from "./CapsuleEventBundleWarnings";
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
   * The Convex tenant id the executor's identity belongs to. Scopes the
   * idempotency keys, so two tenants entering the same TPP invoice number
   * never replay each other's cached results.
   */
  tenantId: string;
  /**
   * Required when the bundle carries warnings. Warnings mean the reports
   * disagreed or something could not be mapped; a human decides, not the agent.
   */
  acceptWarnings?: boolean;
  /** Overrides the idempotency scope. Defaults to tenant + TPP invoice number. */
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

export { warningsNeedingDecision };

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
      safeToEnterWithoutApproval: warningsNeedingDecision(plan).length === 0,
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
    const undecided = warningsNeedingDecision(plan);
    if (undecided.length > 0 && options.acceptWarnings !== true) {
      throw new Error(
        `Refusing to enter: ${undecided.length} warning(s) need a decision. ` +
          `Run the preview, check each warning, then enter with acceptWarnings ` +
          `(CLI: --accept-warnings).\n- ${undecided.join("\n- ")}`,
      );
    }

    // Same identity the planner uses for business keys, so two no-invoice
    // bundles never replay each other's idempotency results — pinned to the
    // tenant, so two tenants' bundles never do either.
    const scope =
      options.idempotencyScope ??
      eventBundleIdempotencyScope(options.tenantId, options.bundle.header);
    const keys = new CapsuleIdempotencyKeyFactory(scope);
    const createdIds = await runPlannedSteps({
      steps: plan.steps,
      seedIds: plan.seedIds,
      executor: this.executor,
      idempotencyKeyFor: (step) =>
        keys.forCapability(step.capabilityId, step.idempotencySuffix),
    });

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
}
