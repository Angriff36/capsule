import { useCallback, useMemo, useState } from "react";
import { warningsNeedingDecision } from "../../../agent/CapsuleEventBundleWarnings";
import type {
  CapsuleEventBundleCatalogMatch,
  CapsuleEventBundleDirectory,
} from "../../../agent/CapsuleEventBundleExistingState";
import {
  buildEventBundlePlan,
  bundleIdentity,
  type EventBundlePlan,
} from "../../../agent/CapsuleEventBundlePlan";
import { runPlannedSteps } from "../../../agent/CapsuleEventBundleStepRunner";
import type { EventBundle } from "../../../lib/tppReports/eventBundle";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { useEventImportCommandExecutor } from "./useEventImportCommandExecutor";

/**
 * Plans and runs an event-bundle import from the browser. The plan is the
 * same one the agent previews; the run uses the same idempotency scope
 * (`tpp:<invoice>`), so re-importing the same BEO — here or through the MCP
 * host — adds what is missing instead of a second event.
 */

export interface EventImportProgress {
  completed: number;
  total: number;
  label: string;
}

export interface EventImportResult {
  eventId: string;
  executedSteps: number;
}

export function useEventImportRunner(input: {
  bundle: EventBundle | null;
  catalog: CapsuleEventBundleCatalogMatch;
  /** Tenant records to resume against; null while they are still loading. */
  directory: CapsuleEventBundleDirectory | null;
}) {
  const commands = useEventImportCommandExecutor();
  const [progress, setProgress] = useState<EventImportProgress | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [result, setResult] = useState<EventImportResult | null>(null);

  // No plan until the directory is in: planning against an empty one would
  // draw fresh parents for a bundle that is already half-entered.
  const plan: EventBundlePlan | null = useMemo(() => {
    if (!input.bundle || !input.directory) return null;
    return buildEventBundlePlan(input.bundle, {
      catalog: input.catalog,
      directory: input.directory,
      unmatchedStaffAsOpenShifts: true,
      raiseReviewFlags: true,
    });
  }, [input.bundle, input.catalog, input.directory]);

  const decisions = useMemo(
    () => (plan ? warningsNeedingDecision(plan) : []),
    [plan],
  );

  const run = useCallback(async () => {
    if (!plan || !input.bundle) return;
    setFailure(null);
    setResult(null);
    const scope = `tpp:${bundleIdentity(input.bundle.header)}`;
    try {
      const unsupported = commands.unsupported(
        plan.steps.map((step) => step.capabilityId),
      );
      if (unsupported.length > 0) {
        throw new Error(
          `This screen cannot run ${unsupported.join(", ")} yet — enter this bundle through the agent importer.`,
        );
      }
      const ids = await runPlannedSteps({
        steps: plan.steps,
        seedIds: plan.seedIds,
        executor: commands.executor,
        idempotencyKeyFor: (step) =>
          `${scope}:${step.capabilityId}:${step.idempotencySuffix}`,
        onProgress: ({ completed, total, step }) =>
          setProgress({ completed, total, label: step.label }),
      });
      const eventId = ids.event;
      if (eventId === undefined) throw new Error("The event was not created");
      setResult({ eventId, executedSteps: plan.steps.length });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setProgress(null);
    }
  }, [commands, input.bundle, plan]);

  return {
    plan,
    decisions,
    progress,
    failure,
    result,
    run,
    dismissFailure: () => setFailure(null),
  };
}
