import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { EmbeddedContext } from "./embedded";
import { ChevronDownIcon } from "./icons";

/** Fired on a section element to open it (the On this page strip uses it). */
export const MERGED_SECTION_OPEN = "merged-section-open";

/**
 * A screen that was folded into another screen (docs/design/screen-map.md),
 * shown as one row of the page: a title, one line saying what it is for, and
 * an arrow. It opens into a bordered panel; shut, it loads nothing. Old URLs
 * redirect to `host#id`, which opens it and scrolls to it.
 *
 * `defaultOpen` is for parts people act on every visit (a queue waiting for a
 * decision); everything else starts shut so the host page stays short.
 */
export function MergedSection({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: ReactNode;
  /** One line: what this part is for. Shown on the row, open or shut. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const { hash } = useLocation();
  const [open, setOpen] = useState(() => defaultOpen || hash === `#${id}`);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const openSelf = () => setOpen(true);
    node.addEventListener(MERGED_SECTION_OPEN, openSelf);
    return () => node.removeEventListener(MERGED_SECTION_OPEN, openSelf);
  }, []);

  useEffect(() => {
    if (!hash) return;
    if (hash === `#${id}`) setOpen(true);
    // The hash names this part, or a piece inside it (an old deep link such
    // as #stage-moves keeps working after its page was folded in).
    const target = () =>
      hash === `#${id}`
        ? ref.current
        : (ref.current?.querySelector(`[id="${CSS.escape(hash.slice(1))}"]`) ??
          null);
    // Content above loads after the first paint and pushes this part down,
    // so scroll again once it has settled.
    const scroll = () => target()?.scrollIntoView({ block: "start" });
    scroll();
    const timers = [400, 1200, 2500].map((ms) => window.setTimeout(scroll, ms));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [hash, id]);

  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={`${id}-title`}
      className="merged-section card scroll-mt-20"
      data-open={open || undefined}
    >
      <h2 id={`${id}-title`} className="merged-section-head">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="merged-section-title">{title}</span>
          {summary ? (
            <span className="merged-section-summary">{summary}</span>
          ) : null}
          <ChevronDownIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="merged-section-chevron"
          />
        </button>
      </h2>
      {open ? (
        <div id={`${id}-body`} className="merged-section-body">
          <EmbeddedContext.Provider value={true}>
            {children}
          </EmbeddedContext.Provider>
        </div>
      ) : null}
    </section>
  );
}
