import { useCallback, useMemo, useState } from "react";
import { warningsNeedingDecision } from "../../../agent/CapsuleEventBundleWarnings";
import type {
  CapsuleEventBundleCatalogMatch,
  CapsuleEventBundleDirectory,
} from "../../../agent/CapsuleEventBundleExistingState";
import { mapBundleExistingEvent } from "../../../agent/CapsuleEventBundleExistingEventMapper";
import { eventBundleIdempotencyScope } from "../../../agent/CapsuleEventBundleIdempotencyScope";
import { normalizeName } from "../../../agent/CapsuleEventBundleShared";
import { useLoadExistingEventRows } from "../../../lib/eventImportExisting";
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
  useListInvoice,
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

/** The calendar date of an instant, in the browser's zone, as the BEO prints it. */
function localIsoDate(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  const invoiceRows = useListInvoice();
  const attachPacketSources = useAttachPacketSources();
  const loadExistingRows = useLoadExistingEventRows();
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

  // No plan until the directory, the events and the invoices are in: planning
  // against an empty list would draw fresh parents for a bundle that is
  // already half-entered, or make a second event for one that exists.
  const plan: EventBundlePlan | null = useMemo(() => {
    if (
      !input.bundle ||
      !input.directory ||
      serviceStyleRows === undefined ||
      eventRows === undefined ||
      invoiceRows === undefined
    )
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
    eventRows,
    invoiceRows,
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
      // The rule (owner, 2026-09-20): a BEO fills in and overwrites the event
      // it belongs to. That event is the live one with this TPP number (or,
      // for an event from before numbers were written, this title and date).
      // No such event: the import makes one.
      const header = input.bundle.header;
      const isLive = (row: Record<string, unknown>) =>
        row.deletedAt == null && row.stage !== "cancelled";
      const live = (eventRows ?? []).filter(isLive);
      const number = header.invoiceNumber?.trim() || undefined;
      // 1. The event that carries this TPP number: typed on the event, or held
      //    only by its invoice (events from before numbers were written).
      const invoiceEventIds = new Set(
        (invoiceRows ?? [])
          .filter(
            (invoice) =>
              invoice.deletedAt == null &&
              number !== undefined &&
              String(invoice.invoiceNumber ?? "").trim() === number &&
              invoice.eventId,
          )
          .map((invoice) => String(invoice.eventId)),
      );
      const matchesNumber = (row: Record<string, unknown>) =>
        number !== undefined &&
        (String(row.eventNumber ?? "").trim() === number ||
          invoiceEventIds.has(String(row._id)));
      // 2. Only when no number matches: the same title on the same date for
      //    the client chosen on the review screen. Another client's "Wedding"
      //    on that date is a different event.
      const chosenClientId = input.catalog?.clientId;
      const matchesTitleDate = (row: Record<string, unknown>) =>
        chosenClientId !== undefined &&
        String(row.clientId ?? "") === chosenClientId &&
        normalizeName(String(row.title ?? "")) ===
          normalizeName(header.title ?? "") &&
        typeof row.startsAt === "number" &&
        localIsoDate(row.startsAt) === header.eventDate;
      const byNumber = live.filter(matchesNumber);
      const byTitleDate = byNumber.length ? [] : live.filter(matchesTitleDate);
      const candidates = byNumber.length ? byNumber : byTitleDate;
      if (candidates.length > 1) {
        throw new Error(
          `${candidates.length} live events match this BEO by ${byNumber.length ? `number ${number}` : "title and date"}. Cancel or renumber the extra one, then import again.`,
        );
      }
      const target = candidates[0];
      let runPlan = plan;
      if (target) {
        runPlan = buildEventBundlePlan(input.bundle, {
          catalog: input.catalog,
          directory: input.directory ?? undefined,
          serviceStyles,
          existing: mapBundleExistingEvent(
            String(target._id),
            await loadExistingRows(),
          ),
          unmatchedStaffAsOpenShifts: true,
          raiseReviewFlags: true,
        });
      }
      // An event the person deleted keeps its old command results. Every run
      // for the same BEO after that, the one that makes the replacement AND
      // the retries against it, uses the replacement's own scope, or the
      // cancelled event's cached results would answer and skip writes.
      const deleted = (eventRows ?? []).filter(
        (row) => !isLive(row) && (matchesNumber(row) || matchesTitleDate(row)),
      ).length;
      const runScope = deleted > 0 ? `${scope}:again${deleted}` : scope;
      const ids = await runPlannedSteps({
        steps: runPlan.steps,
        seedIds: runPlan.seedIds,
        executor: commands.executor,
        idempotencyKeyFor: (step) =>
          `${runScope}:${step.capabilityId}:${step.idempotencySuffix}`,
        onProgress: ({ completed, total, step }) =>
          setProgress({ completed, total, label: step.label }),
      });
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
      setResult({ eventId, executedSteps: runPlan.steps.length });
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
    input.catalog,
    input.directory,
    loadExistingRows,
    serviceStyles,
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
