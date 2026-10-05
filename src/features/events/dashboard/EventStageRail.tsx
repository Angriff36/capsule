import { useLayoutEffect, useRef, useState } from "react";
import "./EventStageRail.css";

export type StageRailCheck = {
  readonly key: string;
  readonly label: string;
  readonly done: boolean;
  /** The move is refused until this is done (a command guard). */
  readonly required?: boolean;
  /** Short fact beside the label, e.g. "3 tasks open". */
  readonly detail?: string;
  /** Where the person fixes it; shown only while the check is open. */
  readonly fix?: { readonly label: string; readonly onFix: () => void };
};

export type StageRailGate = {
  readonly nextLabel: string;
  /** undefined while the facts load; empty when nothing is known to block. */
  readonly checks: readonly StageRailCheck[] | undefined;
};

type Props = {
  /** Stage names in track order. */
  readonly steps: readonly string[];
  /** Index of the current stage; -1 when the event is off the track. */
  readonly current: number;
  /** The checks before the next stage; null at the end of the track. */
  readonly gate?: StageRailGate | null;
};

const CHECK = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m5 12 5 5 9-10" />
  </svg>
);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The event stage rail (component picker, variant B + A's open-check count,
 * 2026-09-29): numbered steps on a line, and under it the checks that stand
 * before the next stage, each open one with a way to where it is fixed.
 * Presentational: the caller supplies the steps, the checks, and the fixes.
 * Styles use the `.evd` dashboard tokens, so render it inside `.evd`.
 */
export function EventStageRail({ steps, current, gate }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const checks = gate?.checks;
  const open = checks?.filter((check) => !check.done).length ?? 0;

  // Narrow screens scroll the steps inside their own box: keep the current
  // step in view, and let keyboard users reach the box to scroll it.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const measure = () => {
      const overflow = box.scrollWidth > box.clientWidth + 1;
      setScrollable(overflow);
      const step = box.querySelector<HTMLElement>('[aria-current="step"]');
      if (overflow && step) {
        box.scrollLeft =
          step.offsetLeft - (box.clientWidth - step.offsetWidth) / 2;
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [current, steps.length]);

  return (
    <div className="evd-rail">
      <div
        ref={scroller}
        className="evd-rail-scroll"
        role={scrollable ? "region" : undefined}
        aria-label={scrollable ? "Event stages, scroll sideways" : undefined}
        tabIndex={scrollable ? 0 : undefined}
      >
        <ol
          className="evd-rail-steps"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(76px, 1fr))`,
          }}
        >
          {steps.map((label, index) => {
            // The last stage ends the track: reaching it means done.
            const reached = current >= 0 && index <= current;
            const finished = current === steps.length - 1;
            const state = !reached
              ? ""
              : index < current || finished
                ? "done"
                : "now";
            return (
              <li
                key={label}
                className={`evd-rail-step ${state}`}
                aria-current={index === current ? "step" : undefined}
              >
                <span className="evd-rail-dot" aria-hidden="true">
                  {state === "done" ? CHECK : index + 1}
                </span>
                <span className="evd-rail-name">
                  {label}
                  {state === "done" ? (
                    <span className="sr-only">, done</span>
                  ) : null}
                </span>
                {state === "now" && open > 0 ? (
                  <small className="evd-rail-open">
                    {plural(open, "check")} open
                  </small>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      {gate ? <StageGateList gate={gate} open={open} /> : null}
    </div>
  );
}

function StageGateList({
  gate,
  open,
}: {
  readonly gate: StageRailGate;
  readonly open: number;
}) {
  const { checks, nextLabel } = gate;
  const requiredOpen = checks?.some((check) => check.required && !check.done);
  return (
    <section className="evd-gate" aria-label={`Before ${nextLabel}`}>
      <p className="evd-gate-h">
        Before {nextLabel}
        {checks?.length ? ` · ${open} of ${checks.length} open` : null}
      </p>
      {checks === undefined ? (
        <p className="evd-gate-note" role="status">
          Checking what is still open…
        </p>
      ) : checks.length === 0 ? (
        <p className="evd-gate-note">Nothing blocking {nextLabel}.</p>
      ) : (
        <ul className="evd-gate-list">
          {checks.map((check) => (
            <li
              key={check.key}
              className={`evd-gate-row${check.done ? " ok" : ""}`}
            >
              <span className="evd-gate-box" aria-hidden="true">
                {check.done ? CHECK : null}
              </span>
              <span className="evd-gate-text">
                <span className="sr-only">
                  {check.done ? "Done: " : "Open: "}
                </span>
                {check.label}
                {check.required && !check.done ? (
                  <span className="evd-gate-tag">Required</span>
                ) : null}
                {check.detail ? (
                  <span className="evd-gate-detail">{check.detail}</span>
                ) : null}
              </span>
              {!check.done && check.fix ? (
                <button
                  type="button"
                  className="evd-gate-fix"
                  onClick={check.fix.onFix}
                >
                  {check.fix.label}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {open > 0 && !requiredOpen ? (
        <p className="evd-gate-note">
          Open items here do not stop the move to {nextLabel}.
        </p>
      ) : null}
    </section>
  );
}
