import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { parseNaturalDate, type NaturalDateKind } from "./naturalDate";

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
> & {
  /** Receives a local HTML date/datetime-local value only after it resolves. */
  onResolvedValue?: (value: string) => void;
  /** Lets an end field resolve phrases such as `+4h` against its start. */
  naturalDateAnchor?: string;
};

/** An empty-string `max` (e.g. from cleared range state) is the same as no
 *  bound at all, so fall back to the 4-digit-year cap in that case too. */
function boundedMax(explicitMax: BoundedDateInputProps["max"], cap: string) {
  return explicitMax === undefined || explicitMax === "" ? cap : explicitMax;
}

function NaturalDateInput({
  kind,
  max,
  onResolvedValue,
  naturalDateAnchor,
  className,
  defaultValue,
  value,
  name,
  id,
  onChange,
  onBlur,
  onKeyDown,
  ...rest
}: BoundedDateInputProps & { kind: NaturalDateKind }) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const initialValue = String(value ?? defaultValue ?? "");
  const [text, setText] = useState(initialValue);
  const [message, setMessage] = useState("");
  const messageId = useId();
  const pickerId = id ? `${id}-picker` : undefined;
  const cap =
    kind === "date" ? MAX_DATE_INPUT_VALUE : MAX_DATETIME_LOCAL_INPUT_VALUE;

  useEffect(() => {
    if (value !== undefined) setText(String(value ?? ""));
  }, [value]);

  const writeNative = (next: string) => {
    if (nativeRef.current && nativeRef.current.value !== next) {
      // The prototype setter bypasses React's value tracker, so the dispatched
      // input event reaches the picker's onChange (and the caller's state).
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(nativeRef.current, next);
      nativeRef.current.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const commit = () => {
    const parsed = parseNaturalDate(text, {
      kind,
      anchor: naturalDateAnchor,
    });
    if (!parsed.ok) {
      setMessage(
        parsed.reason === "empty"
          ? "Enter a date."
          : "We couldn't read that date. Try “next Friday” or “June 14 3pm”.",
      );
      return false;
    }
    setText(parsed.value);
    writeNative(parsed.value);
    setMessage(`→ ${parsed.echo}`);
    return true;
  };

  return (
    <span className="natural-date-entry">
      <input
        {...rest}
        id={id}
        className={className}
        type="text"
        inputMode="text"
        value={text}
        aria-describedby={message ? messageId : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setMessage("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setText(String(value ?? defaultValue ?? ""));
            setMessage("");
          }
          onKeyDown?.(event);
        }}
        onBlur={(event) => {
          // A cleared box clears the picker too, so the form saves no date.
          if (text.trim()) commit();
          else writeNative("");
          onBlur?.(event);
        }}
      />
      <input
        {...rest}
        ref={nativeRef}
        id={pickerId}
        name={name}
        className={`natural-date-picker ${className ?? ""}`}
        type={kind === "date" ? "date" : "datetime-local"}
        max={boundedMax(max, cap)}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        aria-label={`Choose ${kind === "date" ? "date" : "date and time"} from calendar`}
        onChange={(event) => {
          setText(event.target.value);
          setMessage("");
          onResolvedValue?.(event.target.value);
          onChange?.(event);
        }}
      />
      {message ? (
        <small
          id={messageId}
          className="natural-date-message"
          aria-live="polite"
        >
          {message}
        </small>
      ) : null}
    </span>
  );
}

export function BoundedDateInput(props: BoundedDateInputProps) {
  return <NaturalDateInput {...props} kind="date" />;
}

export function BoundedDateTimeLocalInput({ ...props }: BoundedDateInputProps) {
  return <NaturalDateInput {...props} kind="datetime" />;
}
