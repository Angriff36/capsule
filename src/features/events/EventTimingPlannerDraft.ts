import { localDateTime } from "./eventDetailFormHelpers";
import { eventTimingStoredMinutes } from "./eventTimingInputs";
import type { useEventTimingPlan } from "../../lib/operational-transactions";

export type Plan = NonNullable<ReturnType<typeof useEventTimingPlan>>;

export const durationFields = [
  [
    "setupMinutes",
    "timingSetupMinutes",
    "Onsite setup",
    "Before service; filled from your company timing rules for the service style.",
  ],
  [
    "loadMinutes",
    "timingLoadMinutes",
    "Load at shop",
    "Filled from your company load rules; change it for a bigger or smaller load.",
  ],
  [
    "outboundTravelMinutes",
    "timingOutboundTravelMinutes",
    "Travel to venue",
    "Use a checked drive time, not an estimate.",
  ],
  [
    "cleanupMinutes",
    "timingCleanupMinutes",
    "Cleanup & reload",
    "After event end; typically 60 min. Adjust for this event.",
  ],
  [
    "returnTravelMinutes",
    "timingReturnTravelMinutes",
    "Travel back to shop",
    "Check the return trip; it may differ from the outward trip.",
  ],
  [
    "unloadMinutes",
    "timingUnloadMinutes",
    "Unload at shop",
    "Allow time to finish unloading before staff off.",
  ],
] as const;

export type Draft = {
  version: number;
  serviceStartsAt: string;
  originalServiceAt?: number | null;
  /** Optional reasons for a setup or load time that differs from the saved
   * one (PL-TIMING); kept on the event with who changed it. */
  setupOverrideReason?: string;
  loadOverrideReason?: string;
} & Record<(typeof durationFields)[number][0], string>;

export function startDraft(
  plan: Plan,
  /** The company rule minutes for this event, used where nothing is saved. */
  rules?: { setupMinutes?: number | null; loadMinutes?: number | null },
): Draft {
  const { event } = plan;
  const sourceService = plan.milestones.find((m) => m.key === "service")?.row
    ?.startsAt;
  const originalServiceAt =
    event.serviceStartsAt ??
    (event.timingConfiguredAt == null ? sourceService : undefined);
  const defaults: Record<string, number | null | undefined> =
    event.timingConfiguredAt == null
      ? {
          setupMinutes: rules?.setupMinutes ?? undefined,
          loadMinutes: rules?.loadMinutes ?? 60,
          cleanupMinutes: 60,
        }
      : {};
  return {
    version: event.version,
    originalServiceAt,
    serviceStartsAt: localDateTime(originalServiceAt),
    ...Object.fromEntries(
      durationFields.map(([key, field]) => [
        key,
        String(
          eventTimingStoredMinutes({
            stored: event[field],
            suggested: defaults[key],
          }) ??
            defaults[key] ??
            "",
        ),
      ]),
    ),
  } as Draft;
}

export const timeLabel = (value?: number | null) =>
  value == null
    ? "Time not set"
    : new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
