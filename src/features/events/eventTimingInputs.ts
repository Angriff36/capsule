/**
 * The timing inputs the Event itself owns: the minutes the operator stored on
 * the Event (via configureTiming). The live catalog suggestion
 * (timingSuggestedSetupMinutes, computed from the current ServiceStyle name)
 * must NOT stand in for them — a missing stored minute stays missing (null),
 * never falls back to the suggestion. The suggestion is only a form
 * placeholder for not-yet-saved timing.
 */
export function eventTimingStoredMinutes(input: {
  stored?: number | null;
  suggested?: number | null;
}): number | null {
  if (typeof input.stored === "number" && Number.isFinite(input.stored)) {
    return input.stored;
  }
  return null;
}
