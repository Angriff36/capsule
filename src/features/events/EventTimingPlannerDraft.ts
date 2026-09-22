import { localDateTime } from "./eventDetailFormHelpers";
import { eventTimingStoredMinutes } from "./eventTimingInputs";
import type { useEventTimingPlan } from "../../lib/operational-transactions";

export type Plan = NonNullable<ReturnType<typeof useEventTimingPlan>>;

export const durationFields = [
  [
    "setupMinutes",
    "timingSetupMinutes",
    "Onsite setup",
    "Before service; full service 180 min, limited service 90 min.",
  ],
  [
    "loadMinutes",
    "timingLoadMinutes",
    "Load at shop",
    "Start with 60 min; allow more for larger loads or more vehicles.",
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
} & Record<(typeof durationFields)[number][0], string>;

export function startDraft(plan: Plan): Draft {
  const { event } = plan;
  const sourceService = plan.milestones.find((m) => m.key === "service")?.row
    ?.startsAt;
  const originalServiceAt =
    event.serviceStartsAt ??
    (event.timingConfiguredAt == null ? sourceService : undefined);
  const defaults: Record<string, number | null | undefined> =
    event.timingConfiguredAt == null
      ? {
          setupMinutes: event.timingSuggestedSetupMinutes,
          loadMinutes: 60,
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
