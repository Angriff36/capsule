import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { CalendarIcon } from "./icons";
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
  /** "any" keeps a typed day in this year even when it has passed. */
  naturalDateDirection?: "future" | "any";
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
  naturalDateDirection,
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
  // The box shows the resolved date in words; the hidden picker holds the
  // machine value the form submits.
  const display = (raw: string) => {
    if (!raw) return "";
    const parsed = parseNaturalDate(raw, { kind });
    return parsed.ok ? parsed.echo : raw;
  };
  const initialValue = String(value ?? defaultValue ?? "");
  const [text, setText] = useState(() => display(initialValue));
  const [message, setMessage] = useState("");
  const messageId = useId();
  const pickerId = id ? `${id}-picker` : undefined;
  const cap =
    kind === "date" ? MAX_DATE_INPUT_VALUE : MAX_DATETIME_LOCAL_INPUT_VALUE;

  useEffect(() => {
    if (value !== undefined) setText(display(String(value ?? "")));
  }, [value]);

  // A cleared form clears the words shown too, not only the hidden value.
  useEffect(() => {
    const form = nativeRef.current?.form;
    if (!form || value !== undefined) return;
    const onReset = () => {
      setText(display(String(defaultValue ?? "")));
      setMessage("");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === undefined, defaultValue]);

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
    const current = nativeRef.current?.value ?? "";
    if (current && text === display(current)) return true;
    const parsed = parseNaturalDate(text, {
      kind,
      anchor: naturalDateAnchor,
      direction: naturalDateDirection,
    });
    if (!parsed.ok) {
      setMessage(
        parsed.reason === "empty"
          ? "Enter a date."
          : "We couldn't read that date. Try “next Friday” or “June 14 3pm”.",
      );
      return false;
    }
    setText(parsed.echo);
    writeNative(parsed.value);
    setMessage("");
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
        placeholder={
          rest.placeholder ??
          (kind === "date"
            ? "e.g. Dec 1 or next Friday"
            : "e.g. next Friday 6pm")
        }
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
            setText(display(nativeRef.current?.value ?? ""));
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
      {/* One box to type in; the calendar button opens the browser's picker,
          whose hidden input is the value the form actually submits. */}
      <button
        type="button"
        className="natural-date-button"
        aria-label={`Choose ${kind === "date" ? "date" : "date and time"} from calendar`}
        disabled={rest.disabled}
        onClick={() => {
          const native = nativeRef.current;
          if (!native) return;
          try {
            native.showPicker();
          } catch {
            native.focus();
          }
        }}
      >
        <CalendarIcon />
      </button>
      <input
        {...rest}
        tabIndex={-1}
        aria-hidden="true"
        ref={nativeRef}
        id={pickerId}
        name={name}
        className={`natural-date-picker ${className ?? ""}`}
        type={kind === "date" ? "date" : "datetime-local"}
        max={boundedMax(max, cap)}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={(event) => {
          setText(display(event.target.value));
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
