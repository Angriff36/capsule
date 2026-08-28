import React, { useCallback, useEffect, useRef, useState } from "react";
import "./next.css";

/* ============================================================================
   Num / Money — numerals that line up
   Every count and every amount in an ops app is compared vertically. Tabular
   figures and right alignment are not a style choice, they are the feature.
   ========================================================================== */

export function Num({
  value,
  digits = 0,
  suffix,
}: {
  value: number;
  digits?: number;
  suffix?: string;
}) {
  return (
    <span className="cx-num">
      {value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}
      {suffix}
    </span>
  );
}

export function Money({
  value,
  currency = "USD",
  cents = false,
}: {
  value: number;
  currency?: string;
  cents?: boolean;
}) {
  return (
    <span className={`cx-num${value < 0 ? " cx-num-neg" : ""}`}>
      {value.toLocaleString(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: cents ? 2 : 0,
        maximumFractionDigits: cents ? 2 : 0,
      })}
    </span>
  );
}

export const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="cx-kbd">{children}</kbd>
);

/* ============================================================================
   Presence — who else is looking at this record
   Two people editing the same event's headcount is a real operational failure.
   ========================================================================== */

export function Presence({
  people,
  max = 3,
}: {
  people: { name: string; colour?: string }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span
      className="cx-presence"
      title={people.map((p) => p.name).join(", ")}
      aria-label={`${people.length} people viewing`}
    >
      {shown.map((p) => (
        <span
          key={p.name}
          className="cx-presence-dot"
          style={p.colour ? { background: p.colour } : undefined}
        >
          {p.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </span>
      ))}
      {rest > 0 && (
        <span className="cx-presence-dot cx-presence-more">+{rest}</span>
      )}
    </span>
  );
}

/* ============================================================================
   InlineEdit — read mode until you mean it
   Enter/F2/double-click starts. Enter commits, Esc reverts, Tab commits and
   moves on. Async commit shows pending and keeps your value if the server
   rejects it, rather than silently snapping back — the failure mode that makes
   people stop trusting inline edit.
   ========================================================================== */

export interface InlineEditProps {
  value: string | number;
  onCommit: (next: string) => void | Promise<void>;
  /** Return a message to reject the value before it is sent. */
  validate?: (next: string) => string | undefined;
  numeric?: boolean;
  format?: (value: string | number) => React.ReactNode;
  placeholder?: string;
  label?: string;
}

export function InlineEdit({
  value,
  onCommit,
  validate,
  numeric = false,
  format,
  placeholder = "—",
  label = "Edit value",
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = useCallback(
    async (thenBlur: boolean) => {
      const message = validate?.(draft);
      if (message) {
        setError(message);
        return;
      }
      if (draft === String(value)) {
        setEditing(false);
        return;
      }
      setError(undefined);
      setPending(true);
      try {
        await onCommit(draft);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      } finally {
        setPending(false);
      }
      if (thenBlur) setEditing(false);
    },
    [draft, onCommit, validate, value],
  );

  if (!editing) {
    const shown = format ? format(value) : (value ?? "");
    return (
      <button
        type="button"
        className="cx-inline"
        aria-label={label}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {shown === "" || shown == null ? placeholder : shown}
      </button>
    );
  }

  return (
    <span
      style={{ position: "relative", display: "inline-block", width: "100%" }}
    >
      <input
        ref={inputRef}
        className={`cx-inline-input${numeric ? " num" : ""}${pending ? " cx-inline-pending" : ""}`}
        value={draft}
        disabled={pending}
        inputMode={numeric ? "decimal" : undefined}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit(false);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(String(value));
            setError(undefined);
            setEditing(false);
          } else if (e.key === "Tab") {
            void commit(true);
          }
        }}
        onBlur={() => {
          if (!error && !pending) void commit(true);
        }}
      />
      {error && <span className="cx-inline-err">{error}</span>}
    </span>
  );
}

/* ============================================================================
   DecisionPrompt — confirm where the click happened
   Capsule's row-level confirmations currently render at the top of the page, so
   an action reads as a silent no-op. This anchors the confirmation to its own
   trigger and states the consequence before you commit.
   ========================================================================== */

export function DecisionPrompt({
  trigger,
  title,
  body,
  consequence,
  confirmLabel = "Confirm",
  tone = "brand",
  onConfirm,
}: {
  trigger: (props: {
    onClick: () => void;
    "aria-expanded": boolean;
  }) => React.ReactNode;
  title: string;
  body?: string;
  /** The thing they will wish someone had told them. */
  consequence?: string;
  confirmLabel?: string;
  tone?: "brand" | "danger";
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    goRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.parentElement?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <span className="cx-prompt-anchor">
      {trigger({ onClick: () => setOpen((v) => !v), "aria-expanded": open })}
      {open && (
        <div
          className="cx-prompt"
          ref={boxRef}
          role="dialog"
          aria-label={title}
        >
          <div className="cx-prompt-title">{title}</div>
          {body && <div className="cx-prompt-body">{body}</div>}
          {consequence && (
            <div className="cx-prompt-consequence">{consequence}</div>
          )}
          <div className="cx-prompt-actions">
            <button
              ref={goRef}
              className="cx-go"
              data-tone={tone === "danger" ? "danger" : undefined}
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </button>
            <button className="cx-no" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/* ============================================================================
   Toasts — every mutation is undoable for ten seconds
   Undo is cheaper than a confirmation dialog on everything, and it is the
   correct affordance for a fast operator who will occasionally misclick.
   ========================================================================== */

export interface Toast {
  id: number;
  message: React.ReactNode;
  tone?: "default" | "danger";
  undo?: () => void;
  ttl?: number;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = next.current++;
      setToasts((all) => [...all, { ...toast, id }]);
      const ttl = toast.ttl ?? 10000;
      window.setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="cx-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="cx-toast"
          data-tone={t.tone === "danger" ? "danger" : undefined}
          style={{ position: "relative", overflow: "hidden" }}
        >
          <span>{t.message}</span>
          {t.undo && (
            <button
              className="cx-toast-undo"
              onClick={() => {
                t.undo?.();
                onDismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
          <span
            className="cx-toast-bar"
            style={{ animationDuration: `${t.ttl ?? 10000}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

/* ============================================================================
   TimeWindowField — a service window, not two native date inputs
   The app's native datetime inputs swallow keystrokes in the year segment and
   do not stick when set programmatically. This owns its own segments, so
   arrow keys and typing behave, and it shows the derived duration — which is
   the number an operator is actually reasoning about.
   ========================================================================== */

type Segment = "h" | "m" | "ampm";

function clampSeg(seg: Segment, raw: number): number {
  if (seg === "h") return Math.min(12, Math.max(1, raw));
  if (seg === "m") return Math.min(59, Math.max(0, raw));
  return raw;
}

export interface TimeValue {
  h: number;
  m: number;
  pm: boolean;
}

function toMinutes(t: TimeValue) {
  const h = (t.h % 12) + (t.pm ? 12 : 0);
  return h * 60 + t.m;
}

function fmt(n: number) {
  return String(n).padStart(2, "0");
}

function TimeSegments({
  value,
  onChange,
  label,
}: {
  value: TimeValue;
  onChange: (v: TimeValue) => void;
  label: string;
}) {
  const typed = useRef("");

  const handle =
    (seg: Segment) => (e: React.KeyboardEvent<HTMLSpanElement>) => {
      const step = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
      if (step !== 0) {
        e.preventDefault();
        typed.current = "";
        if (seg === "ampm") return onChange({ ...value, pm: !value.pm });
        const cur = seg === "h" ? value.h : value.m;
        const max = seg === "h" ? 12 : 60;
        const min = seg === "h" ? 1 : 0;
        let n = cur + step;
        if (n > max) n = min;
        if (n < min) n = max;
        return onChange({ ...value, [seg]: clampSeg(seg, n) } as TimeValue);
      }
      if (/^[0-9]$/.test(e.key) && seg !== "ampm") {
        e.preventDefault();
        typed.current = (typed.current + e.key).slice(-2);
        const n = clampSeg(seg, Number(typed.current));
        onChange({ ...value, [seg]: n } as TimeValue);
        return;
      }
      if ((e.key === "a" || e.key === "p") && seg === "ampm") {
        e.preventDefault();
        onChange({ ...value, pm: e.key === "p" });
      }
    };

  return (
    <>
      <span
        role="spinbutton"
        tabIndex={0}
        className="cx-seg"
        aria-label={`${label} hour`}
        aria-valuenow={value.h}
        onKeyDown={handle("h")}
        onFocus={() => (typed.current = "")}
      >
        {fmt(value.h)}
      </span>
      <span className="cx-window-sep">:</span>
      <span
        role="spinbutton"
        tabIndex={0}
        className="cx-seg"
        aria-label={`${label} minute`}
        aria-valuenow={value.m}
        onKeyDown={handle("m")}
        onFocus={() => (typed.current = "")}
      >
        {fmt(value.m)}
      </span>
      <span
        role="spinbutton"
        tabIndex={0}
        className="cx-seg"
        aria-label={`${label} meridiem`}
        onKeyDown={handle("ampm")}
      >
        {value.pm ? "PM" : "AM"}
      </span>
    </>
  );
}

export function TimeWindowField({
  from,
  to,
  onChange,
  minMinutes = 30,
}: {
  from: TimeValue;
  to: TimeValue;
  onChange: (next: { from: TimeValue; to: TimeValue }) => void;
  /** Shortest window that makes operational sense. */
  minMinutes?: number;
}) {
  const span = toMinutes(to) - toMinutes(from);
  const invalid = span < minMinutes;
  const hours = Math.floor(Math.abs(span) / 60);
  const mins = Math.abs(span) % 60;

  return (
    <span className="cx-window">
      <TimeSegments
        value={from}
        onChange={(v) => onChange({ from: v, to })}
        label="Start"
      />
      <span className="cx-window-sep" style={{ padding: "0 6px" }}>
        →
      </span>
      <TimeSegments
        value={to}
        onChange={(v) => onChange({ from, to: v })}
        label="End"
      />
      <span className="cx-window-dur" data-invalid={invalid || undefined}>
        {span <= 0
          ? "ends before it starts"
          : invalid
            ? `${mins}m — under ${minMinutes}m`
            : `${hours ? `${hours}h ` : ""}${mins ? `${mins}m` : ""}`.trim()}
      </span>
    </span>
  );
}
