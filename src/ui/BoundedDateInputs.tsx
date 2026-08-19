import type { InputHTMLAttributes } from "react";

/**
 * Native `date` / `datetime-local` inputs without a `max` attribute let the
 * year segment accept up to six digits in Chromium (years up to 275760), so
 * ordinary continuous typing corrupts the value — "…2026" keeps eating the
 * hour keystrokes and lands on years like 202605 (issue #148). Capping the
 * year at 9999 makes the browser commit the year after four digits and
 * auto-advance to the next segment.
 *
 * Every schedule field in the app must render through these components (or
 * otherwise carry a 4-digit-year `max`); tests/date-input-year-bound.test.ts
 * enforces it.
 */
export const MAX_DATE_INPUT_VALUE = "9999-12-31";
export const MAX_DATETIME_LOCAL_INPUT_VALUE = "9999-12-31T23:59";

type BoundedDateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/** An empty-string `max` (e.g. from cleared range state) is the same as no
 *  bound at all, so fall back to the 4-digit-year cap in that case too. */
function boundedMax(explicitMax: BoundedDateInputProps["max"], cap: string) {
  return explicitMax === undefined || explicitMax === "" ? cap : explicitMax;
}

export function BoundedDateInput({ max, ...rest }: BoundedDateInputProps) {
  return (
    <input type="date" max={boundedMax(max, MAX_DATE_INPUT_VALUE)} {...rest} />
  );
}

export function BoundedDateTimeLocalInput({
  max,
  ...rest
}: BoundedDateInputProps) {
  return (
    <input
      type="datetime-local"
      max={boundedMax(max, MAX_DATETIME_LOCAL_INPUT_VALUE)}
      {...rest}
    />
  );
}
