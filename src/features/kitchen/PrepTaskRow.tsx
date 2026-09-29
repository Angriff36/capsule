import { useId, type ReactNode } from "react";
import { readableRecipeAmount } from "../../lib/recipeDisplay";
import { prepQuantityLabel } from "./prepQuantityLabel";
import { prepTaskCheck } from "./prepTaskCheck";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const dayTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Today's due times read as a clock; anything else carries its date. */
function dueLabel(dueAt: number, now: number) {
  const due = new Date(dueAt);
  const today = new Date(now);
  return due.toDateString() === today.toDateString()
    ? timeFmt.format(due)
    : dayTimeFmt.format(due);
}

/** "12 lb", "54 portions": whole units round up, as on the paper sheet. */
export function prepTaskAmount(quantity: number, unit: string) {
  return readableRecipeAmount(Number(prepQuantityLabel(quantity, unit)), unit);
}

export type PrepTaskRowProps = {
  /** Task name as the cook reads it ("Dice shallots"). */
  name: string;
  quantity: number;
  unit: string;
  /** The dish or recipe this prep is for. */
  context?: string | null;
  station?: string | null;
  dueAt?: number | null;
  /** Prep task status; decides whether the box can be ticked. */
  status: string;
  blockReason?: string | null;
  /** Clock the late flag is read against. */
  now: number;
  /** This row's own command is in flight: show it ticked while it saves. */
  working?: boolean;
  /** Another command is in flight; hold the box until it settles. */
  locked?: boolean;
  /** Completion is saved on this device and sends when back online. */
  queued?: boolean;
  onComplete?: () => void;
  /** Secondary controls and notes (Claim, Start, recipe link…). */
  children?: ReactNode;
};

/** Kitchen prep task, variant A ("Checklist rows"): a big checkbox, the task
 *  and amount, what it is for, and a due time that turns red when late. */
export function PrepTaskRow({
  name,
  quantity,
  unit,
  context,
  station,
  dueAt,
  status,
  blockReason,
  now,
  working = false,
  locked = false,
  queued = false,
  onComplete,
  children,
}: PrepTaskRowProps) {
  const id = useId();
  const check = prepTaskCheck(status, blockReason);
  const checked = check.checked || working || queued;
  const late = !checked && dueAt != null && dueAt < now;
  const disabled =
    !check.canComplete || !onComplete || working || queued || locked;
  // A ticked box keeps its ok colour: it is read-only, not greyed out.
  const inert = disabled && !checked;
  const note = working
    ? "Saving…"
    : queued
      ? "Saved on this phone. It sends when you're back online."
      : check.note;
  const title = name.trim() || "Prep task";
  const amount = prepTaskAmount(quantity, unit);
  const detail = [context, station].filter(Boolean).join(" · ");

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex min-h-[60px] items-center gap-3.5 px-4 py-2.5">
        {/* Only the box ticks: completing has no undo, so a stray tap on the
            task name must not finish it. The 44px wrapper is the hit area. */}
        <span className="-m-2 flex size-11 shrink-0 items-center justify-center">
          <input
            id={id}
            type="checkbox"
            className="size-7 shrink-0 cursor-pointer accent-ok disabled:cursor-not-allowed aria-disabled:cursor-default"
            checked={checked}
            disabled={inert}
            aria-disabled={disabled || undefined}
            aria-label={`Done: ${title}, ${amount}`}
            aria-describedby={note ? `${id}-note` : undefined}
            onChange={(event) => {
              if (event.target.checked && !disabled) onComplete?.();
              // There is no reopen command; a ticked box stays ticked.
            }}
          />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="min-w-0 flex-1">
            <span
              className={`block text-base font-semibold break-words ${checked ? "text-ink-3 line-through" : "text-ink"}`}
            >
              {title} · {amount}
            </span>
            <span className="block text-sm break-words text-ink-3">
              {detail || "No station set"}
            </span>
            {note ? (
              <span
                id={`${id}-note`}
                className={`block text-sm break-words ${check.tone === "danger" && !working && !queued ? "text-danger" : "text-ink-2"}`}
              >
                {note}
              </span>
            ) : null}
          </span>
          {dueAt != null ? (
            <time
              dateTime={new Date(dueAt).toISOString()}
              className={`shrink-0 text-right font-mono text-sm whitespace-nowrap ${late ? "font-semibold text-danger" : "text-ink-2"}`}
            >
              {dueLabel(dueAt, now)}
              {late ? <span className="sr-only"> (late)</span> : null}
            </time>
          ) : (
            <span className="shrink-0 font-mono text-sm whitespace-nowrap text-ink-3">
              No time
            </span>
          )}
        </div>
      </div>
      {children ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 pr-4 pb-3 pl-[58px]">
          {children}
        </div>
      ) : null}
    </li>
  );
}
