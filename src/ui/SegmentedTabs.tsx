import { MotionConfig, motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import "./ui-layouts.css";

export type SegmentedTabOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** A count shown after the label, e.g. how many rows the filter holds. */
  count?: number;
};

/**
 * A row of filter tabs with one sliding highlight, adapted from ui-layouts
 * "Tabs" (MIT, see ui-layouts.LICENSE.txt). It replaces the hand-made pill,
 * switch and button strips that each screen drew its own way. The highlight
 * moves to the chosen tab; arrow keys, Home and End move between tabs.
 * Reduced-motion users get the move without the slide.
 */
export function SegmentedTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  label: string;
  options: readonly SegmentedTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const pillId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (index: number) => {
    const next = options[(index + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [(index + options.length) % options.length]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = options.findIndex((option) => option.value === value);
    if (event.key === "ArrowRight") focusTab(current + 1);
    else if (event.key === "ArrowLeft") focusTab(current - 1);
    else if (event.key === "Home") focusTab(0);
    else if (event.key === "End") focusTab(options.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={`segmented-tabs segmented-tabs-${size}${className ? ` ${className}` : ""}`}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-active={active || undefined}
              onClick={() => onChange(option.value)}
            >
              {active ? (
                <motion.span
                  layoutId={pillId}
                  className="segmented-tabs-pill"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="segmented-tabs-label">
                {option.label}
                {option.count !== undefined ? (
                  <span className="segmented-tabs-count">{option.count}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </MotionConfig>
  );
}
