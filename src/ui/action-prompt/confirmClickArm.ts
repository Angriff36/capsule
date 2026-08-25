/** The inline confirm panel mounts under the pointer that opened it. */
export const ACTION_PROMPT_CONFIRM_ARM_MS = 400;

export function isActionPromptConfirmArmed(elapsedMs: number): boolean {
  return (
    typeof elapsedMs === "number" && elapsedMs >= ACTION_PROMPT_CONFIRM_ARM_MS
  );
}

/**
 * Confirm-kind stays inert until armed so a leftover mouseup / ghost click
 * cannot confirm a destructive action. Keep as-is / cancel is never gated.
 */
export function shouldAcceptConfirmClick(input: {
  kind: string;
  armed: boolean;
}): boolean {
  if (input.kind !== "confirm") return true;
  return input.armed === true;
}

/** Mount-tick snapshot used by tests: confirm must not be clickable. */
export function confirmControlMountState(armed: boolean): {
  disabled: boolean;
  pointerEvents: "none" | "auto";
  acceptsClick: boolean;
} {
  return {
    disabled: !armed,
    pointerEvents: armed ? "auto" : "none",
    acceptsClick: shouldAcceptConfirmClick({ kind: "confirm", armed }),
  };
}
