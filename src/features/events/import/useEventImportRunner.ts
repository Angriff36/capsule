import { useCallback, useMemo, useState } from "react";
import { warningsNeedingDecision } from "../../../agent/CapsuleEventBundleWarnings";
import type {
  CapsuleEventBundleCatalogMatch,
  CapsuleEventBundleDirectory,
} from "../../../agent/CapsuleEventBundleExistingState";
import { eventBundleIdempotencyScope } from "../../../agent/CapsuleEventBundleIdempotencyScope";
import {
  buildEventBundlePlan,
  type EventBundlePlan,
} from "../../../agent/CapsuleEventBundlePlan";
import { runPlannedSteps } from "../../../agent/CapsuleEventBundleStepRunner";
import type { Id } from "../../../lib/api";
import { useAttachPacketSources } from "../../../lib/eventPacket/useEventPacket";
import type { EventBundle } from "../../../lib/tppReports/eventBundle";
import {
  useListEvent,
  useListServiceStyle,
} from "../../../lib/manifest-convex-react";
import { useAuthStatus } from "../../../lib/useAuthStatus";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { useEventImportCommandExecutor } from "./useEventImportCommandExecutor";

/**
 * Plans and runs an event-bundle import from the browser. The plan is the
 * same one the agent previews; the run uses the same tenant-scoped
 * idempotency scope (`tpp:<tenant>:<invoice>`), so re-importing the same BEO
 * — here or through the MCP host — adds what is missing instead of a second
 * event, and another tenant's identical invoice number never collides.
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
  /** The pasted (or .rtf) BEO text: it also becomes the workbook source. */
  pastedText: string;
}) {
  const commands = useEventImportCommandExecutor();
  const tenantId = useAuthStatus()?.tenantId ?? null;
  const serviceStyleRows = useListServiceStyle();
  const eventRows = useListEvent();
  const attachPacketSources = useAttachPacketSources();
  const serviceStyles = useMemo(
    () =>
      (serviceStyleRows ?? [])
        .filter((row) => row.deletedAt == null && row.status === "active")
        .map((row) => ({ id: String(row._id), name: String(row.name) })),
    [serviceStyleRows],
  );
  const [progress, setProgress] = useState<EventImportProgress | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [result, setResult] = useState<EventImportResult | null>(null);

  // No plan until the directory is in: planning against an empty one would
  // draw fresh parents for a bundle that is already half-entered.
  const plan: EventBundlePlan | null = useMemo(() => {
    if (!input.bundle || !input.directory || serviceStyleRows === undefined)
      return null;
    return buildEventBundlePlan(input.bundle, {
      catalog: input.catalog,
      directory: input.directory,
      serviceStyles,
      unmatchedStaffAsOpenShifts: true,
      raiseReviewFlags: true,
    });
  }, [
    input.bundle,
    input.catalog,
    input.directory,
    serviceStyleRows,
    serviceStyles,
  ]);

  const decisions = useMemo(
    () => (plan ? warningsNeedingDecision(plan) : []),
    [plan],
  );

  const run = useCallback(async () => {
    if (!plan || !input.bundle) return;
    setFailure(null);
    setResult(null);
    try {
      // Throws while the signed-in tenant is unknown: no tenant, no key.
      const scope = eventBundleIdempotencyScope(tenantId, input.bundle.header);
      const unsupported = commands.unsupported(
        plan.steps.map((step) => step.capabilityId),
      );
      if (unsupported.length > 0) {
        throw new Error(
          `This screen cannot run ${unsupported.join(", ")} yet — enter this bundle through the agent importer.`,
        );
      }
      // The same BEO resumes its own event. But an event the person deleted
      // (stage cancelled) is gone for them: a new import of that BEO must make
      // a fresh event, not return them to the cancelled one. Each retry scope
      // is fixed text, so a retry of a retry still resumes and never doubles.
      const gone = (id: string | undefined) => {
        const row = (eventRows ?? []).find((event) => String(event._id) === id);
        return (
          row !== undefined &&
          (row.stage === "cancelled" || row.deletedAt != null)
        );
      };
      let ids: Record<string, string> = {};
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const attemptScope = attempt === 0 ? scope : `${scope}:again${attempt}`;
        ids = await runPlannedSteps({
          steps: plan.steps,
          seedIds: plan.seedIds,
          executor: commands.executor,
          idempotencyKeyFor: (step) =>
            `${attemptScope}:${step.capabilityId}:${step.idempotencySuffix}`,
          onProgress: ({ completed, total, step }) =>
            setProgress({ completed, total, label: step.label }),
        });
        if (!gone(ids.event)) break;
      }
      const eventId = ids.event;
      if (eventId === undefined) throw new Error("The event was not created");
      // The BEO that made the event is also the Event workbook source, so the
      // workbook starts with these values and asks for none of them again.
      // The event is made at this point: a workbook failure must not hide it.
      if (input.pastedText.trim().length > 0) {
        try {
          await attachPacketSources(
            eventId as Id<"events">,
            [
              {
                name: `BEO ${input.bundle.header.invoiceNumber ?? ""} (imported text).txt`.replace(
                  "  ",
                  " ",
                ),
                mimeType: "text/plain",
                bytes: new TextEncoder().encode(input.pastedText),
              },
            ],
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          );
        } catch (error) {
          console.warn(
            "Event import: the BEO was not added to the workbook",
            error,
          );
        }
      }
      setResult({ eventId, executedSteps: plan.steps.length });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setProgress(null);
    }
  }, [
    attachPacketSources,
    commands,
    eventRows,
    input.bundle,
    input.pastedText,
    plan,
    tenantId,
  ]);

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
