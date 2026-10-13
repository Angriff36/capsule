import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { EmbeddedContext } from "./embedded";

/**
 * A screen that was folded into another screen (docs/design/screen-map.md).
 * It gives the folded content one section title and an anchor. The old URL
 * redirects to `host#id`, and this section scrolls itself into view when the
 * hash names it, so old links still land on the right content.
 */
export function MergedSection({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== `#${id}`) return;
    // Content above loads after the first paint and pushes this section
    // down, so scroll again once it has settled.
    const scroll = () => ref.current?.scrollIntoView({ block: "start" });
    scroll();
    const timers = [400, 1200, 2500].map((ms) => window.setTimeout(scroll, ms));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [hash, id]);
  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={`${id}-title`}
      className="merged-section scroll-mt-20 border-t-[1.5px] border-ink pt-4"
    >
      <h2
        id={`${id}-title`}
        className="font-display text-2xl leading-tight font-bold tracking-tight text-ink"
      >
        {title}
      </h2>
      {lead ? (
        <p className="mt-1 max-w-[72ch] text-sm text-ink-2">{lead}</p>
      ) : null}
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-4">
        <EmbeddedContext.Provider value={true}>
          {children}
        </EmbeddedContext.Provider>
      </div>
    </section>
  );
}
