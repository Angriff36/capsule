import { useEffect, useRef, useState, type ReactNode } from "react";
import { WorkspaceTabs } from "@/ui/WorkspaceTabs";
import { ReportsFailureBanner } from "../reports/ReportsFailureBanner";
import { EOS_PATHS } from "./eosModel";
import "./eos.css";

export function EosTabs() {
  return (
    <WorkspaceTabs
      label="EOS"
      tabs={[
        { label: "Overview", path: EOS_PATHS.overview, end: true },
        { label: "Vision", path: EOS_PATHS.vision },
        { label: "People", path: EOS_PATHS.people },
        { label: "Process", path: EOS_PATHS.process },
        { label: "L10 & Rocks", path: EOS_PATHS.l10 },
      ]}
    />
  );
}

/** Runs one save at a time and keeps its failure to show. */
export function useRun() {
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
      return true;
    } catch (error) {
      setFailure(error);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const banner = failure ? <ReportsFailureBanner error={failure} /> : null;
  return { run, busy, banner };
}

/** A panel in one EOS component's tone. */
export function EosPanel({
  tone,
  id,
  eyebrow,
  title,
  lead,
  actions,
  children,
  bodyClassName = "eos-panel-body",
}: {
  tone: string;
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section id={id} className={`eos-panel eos-tone-${tone}`}>
      <div className="eos-panel-head">
        <div className="min-w-0">
          {eyebrow ? <span className="eos-eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
          {lead ? <p>{lead}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * Text you click to edit, in place. Enter (or leaving the box) saves, Escape
 * puts it back. Multi-line fields save with Ctrl+Enter or on leaving.
 */
export function InlineText({
  value,
  placeholder,
  label,
  multiline = false,
  disabled = false,
  inputType = "text",
  display,
  onSave,
}: {
  value: string;
  placeholder: string;
  label: string;
  multiline?: boolean;
  disabled?: boolean;
  inputType?: "text" | "number" | "date";
  display?: string;
  onSave: (next: string) => Promise<unknown> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value.trim()) void onSave(draft.trim());
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing && !disabled) {
    const common = {
      ref,
      "aria-label": label,
      className: "input w-full",
      value: draft,
      placeholder,
      onBlur: commit,
    };
    return multiline ? (
      <textarea
        {...common}
        rows={Math.max(3, draft.split("\n").length + 1)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancel();
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
            commit();
        }}
      />
    ) : (
      <input
        {...common}
        type={inputType}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancel();
          if (event.key === "Enter") commit();
        }}
      />
    );
  }

  const shown = display ?? value;
  return (
    <button
      type="button"
      className={`eos-field${shown ? "" : " eos-field-empty"}`}
      aria-label={`${label}: ${shown || "empty"}. ${disabled ? "" : "Click to edit."}`}
      disabled={disabled}
      onClick={() => setEditing(true)}
    >
      {shown || (disabled ? "Not written yet" : placeholder)}
    </button>
  );
}

/** A thin progress bar in the panel's tone. */
export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="eos-bar"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Round score dial for the checkup. */
export function ScoreRing({
  value,
  caption,
}: {
  value: number | null;
  caption: string;
}) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const shown = value ?? 0;
  return (
    <div className="eos-ring">
      <svg viewBox="0 0 112 112" aria-hidden="true">
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="var(--tone-line)"
          strokeWidth="10"
        />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="var(--tone)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
        />
      </svg>
      <div className="eos-ring-label">
        <strong>{value == null ? "—" : value}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}
