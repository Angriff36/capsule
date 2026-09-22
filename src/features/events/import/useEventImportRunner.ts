import { useCallback, useEffect, useMemo, useState } from "react";
import { warningsNeedingDecision } from "../../../agent/CapsuleEventBundleWarnings";
import type {
  CapsuleEventBundleCatalogMatch,
  CapsuleEventBundleDirectory,
} from "../../../agent/CapsuleEventBundleExistingState";
import {
  mapBundleExistingEvent,
  type BundleExistingEventRows,
} from "../../../agent/CapsuleEventBundleExistingEventMapper";
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

  // The event this BEO belongs to (owner rule, 2026-09-20: a BEO fills in
  // and overwrites the event it belongs to): the live one with this TPP
  // number, typed on the event or held only by its invoice; else the same
  // title on the same date for the client chosen on the review screen.
  // Resolved BEFORE the plan, so the steps a person reviews are the steps
  // that run.
  const match = useMemo(() => {
    const header = input.bundle?.header;
    if (!header || eventRows === undefined || invoiceRows === undefined)
      return null;
    const isLive = (row: Record<string, unknown>) =>
      row.deletedAt == null && row.stage !== "cancelled";
    const number = header.invoiceNumber?.trim() || undefined;
    const invoiceEventIds = new Set(
      invoiceRows
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
    const chosenClientId = input.catalog?.clientId;
    const matchesTitleDate = (row: Record<string, unknown>) =>
      chosenClientId !== undefined &&
      String(row.clientId ?? "") === chosenClientId &&
      normalizeName(String(row.title ?? "")) ===
        normalizeName(header.title ?? "") &&
      typeof row.startsAt === "number" &&
      localIsoDate(row.startsAt) === header.eventDate;
    const live = eventRows.filter(isLive);
    const byNumber = live.filter(matchesNumber);
    const byTitleDate = byNumber.length ? [] : live.filter(matchesTitleDate);
    const candidates = byNumber.length ? byNumber : byTitleDate;
    // An event the person deleted keeps its old command results: every run
    // for the same BEO after that uses the replacement's own scope.
    const deleted = eventRows.filter(
      (row) => !isLive(row) && (matchesNumber(row) || matchesTitleDate(row)),
    ).length;
    if (candidates.length > 1) {
      return {
        targetId: null as string | null,
        deleted,
        ambiguous: `${candidates.length} live events match this BEO by ${byNumber.length ? `number ${number}` : "title and date"}. Cancel or renumber the extra one, then import again.`,
      };
    }
    return {
      targetId: candidates[0] ? String(candidates[0]._id) : null,
      deleted,
      ambiguous: null as string | null,
    };
  }, [input.bundle, input.catalog?.clientId, eventRows, invoiceRows]);

  // The matched event's current rows, loaded once per target, so the plan
  // adds what is missing and overwrites what the BEO carries.
  const [existingRows, setExistingRows] = useState<{
    targetId: string;
    rows: BundleExistingEventRows;
  } | null>(null);
  const targetId = match?.targetId ?? null;
  const loadedTargetId = existingRows?.targetId ?? null;
  useEffect(() => {
    if (!targetId || loadedTargetId === targetId) return;
    let stale = false;
    void loadExistingRows().then((rows) => {
      if (!stale) setExistingRows({ targetId, rows });
    });
    return () => {
      stale = true;
    };
  }, [targetId, loadedTargetId, loadExistingRows]);

  // Two live events claim this BEO: say so where failures show, and plan
  // nothing until a person settles it.
  const ambiguous = match?.ambiguous ?? null;
  useEffect(() => {
    if (ambiguous) setFailure(classifyCommandFailure(new Error(ambiguous)));
  }, [ambiguous]);

  // No plan until the directory, the events, the invoices and, for a matched
  // event, its rows are in: planning against an empty list would draw fresh
  // parents for a bundle that is already half-entered, or make a second
  // event for one that exists.
  const plan: EventBundlePlan | null = useMemo(() => {
    if (
      !input.bundle ||
      !input.directory ||
      serviceStyleRows === undefined ||
      !match ||
      match.ambiguous
    )
      return null;
    const existing =
      match.targetId && existingRows?.targetId === match.targetId
        ? mapBundleExistingEvent(match.targetId, existingRows.rows)
        : undefined;
    if (match.targetId && !existing) return null;
    return buildEventBundlePlan(input.bundle, {
      catalog: input.catalog,
      directory: input.directory,
      serviceStyles,
      existing,
      unmatchedStaffAsOpenShifts: true,
      raiseReviewFlags: true,
    });
  }, [
    input.bundle,
    input.catalog,
    input.directory,
    serviceStyleRows,
    serviceStyles,
    match,
    existingRows,
  ]);

  const decisions = useMemo(
    () => (plan ? warningsNeedingDecision(plan) : []),
    [plan],
  );

  const run = useCallback(async () => {
    if (!plan || !input.bundle || !match) return;
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
      const runScope =
        match.deleted > 0 ? `${scope}:again${match.deleted}` : scope;
      const ids = await runPlannedSteps({
        steps: plan.steps,
        seedIds: plan.seedIds,
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
      setResult({ eventId, executedSteps: plan.steps.length });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setProgress(null);
    }
  }, [
    attachPacketSources,
    commands,
    input.bundle,
    input.pastedText,
    match,
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
