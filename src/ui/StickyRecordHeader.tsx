import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { ActionMenu } from "./primitives";

export type StickyRecordFact = {
  label: string;
  value: ReactNode;
};

export type StickyRecordSection = {
  id: string;
  label: string;
};

const SCROLLER_SELECTOR = ".app-canvas";
const STICKY_HEADER_OFFSET = 68;

function getScroller() {
  return document.querySelector<HTMLElement>(SCROLLER_SELECTOR);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Watches the sentinel at the bottom of a record's full masthead. The app shell
 * owns scrolling, so observing the browser viewport here would never be right.
 */
export function useStuckHeader(sentinelRef: RefObject<HTMLElement | null>) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = getScroller();
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setStuck(
          !entry.isIntersecting &&
            entry.boundingClientRect.top <= (entry.rootBounds?.top ?? 0),
        );
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelRef]);

  return stuck;
}

/**
 * Locates the visible record panels within one page/tab and keeps the compact
 * header's menu in sync without scroll-event rendering.
 */
export function useSectionNav(
  scopeRef: RefObject<HTMLElement | null>,
  sectionKey?: string,
) {
  const [sections, setSections] = useState<StickyRecordSection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const collect = () => {
      const found = Array.from(
        scope.querySelectorAll<HTMLElement>("[data-sticky-section], section"),
      )
        .map((section, index) => {
          const heading = section.querySelector<HTMLElement>("h2");
          const label = heading?.textContent?.trim();
          if (!label) return null;
          if (!section.id) {
            const slug = label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "");
            section.id = `record-section-${slug || index + 1}-${index + 1}`;
          }
          return { id: section.id, label };
        })
        .filter((section): section is StickyRecordSection => section != null);
      setSections((current) =>
        current.length === found.length &&
        current.every((section, index) => section.id === found[index]?.id)
          ? current
          : found,
      );
    };

    collect();
    const mutationObserver = new MutationObserver(collect);
    mutationObserver.observe(scope, { childList: true, subtree: true });
    return () => mutationObserver.disconnect();
  }, [scopeRef, sectionKey]);

  useEffect(() => {
    const root = getScroller();
    if (!root || sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible?.target.id) {
          setActiveId((current) =>
            current === visible.target.id ? current : visible.target.id,
          );
        }
      },
      { root, rootMargin: `-${STICKY_HEADER_OFFSET}px 0px -55%`, threshold: 0 },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = (id: string) => {
    const root = getScroller();
    const section = document.getElementById(id);
    if (!root || !section) return;
    const rootBox = root.getBoundingClientRect();
    const sectionBox = section.getBoundingClientRect();
    root.scrollTo({
      top: root.scrollTop + sectionBox.top - rootBox.top - STICKY_HEADER_OFFSET,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    setActiveId(id);
  };

  return { sections, activeId, scrollToSection };
}

export function StickyRecordHeader({
  title,
  facts,
  actions,
  sentinelRef,
  sectionScopeRef,
  sectionKey,
  headingId,
}: {
  title: string;
  facts: StickyRecordFact[];
  actions?: ReactNode;
  sentinelRef: RefObject<HTMLElement | null>;
  sectionScopeRef: RefObject<HTMLElement | null>;
  sectionKey?: string;
  headingId: string;
}) {
  const stuck = useStuckHeader(sentinelRef);
  const { sections, activeId, scrollToSection } = useSectionNav(
    sectionScopeRef,
    sectionKey,
  );
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const root = getScroller();
    if (!root) return;
    const update = () => {
      const box = root.getBoundingClientRect();
      setPosition({ top: box.top, left: box.left, width: box.width });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const style = useMemo(
    () =>
      ({
        "--sticky-record-header-top": `${position.top}px`,
        "--sticky-record-header-left": `${position.left}px`,
        "--sticky-record-header-width": `${position.width}px`,
      }) as CSSProperties,
    [position],
  );

  const backToTop = () => {
    const root = getScroller();
    const heading = document.getElementById(headingId);
    heading?.focus({ preventScroll: true });
    root?.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  return (
    <div
      className="sticky-record-header"
      data-testid="sticky-record-header"
      aria-hidden={!stuck}
      hidden={!stuck}
      style={style}
    >
      <div className="sticky-record-header-title" title={title}>
        {title}
      </div>
      <dl className="sticky-record-header-facts" aria-label="Record facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className="sticky-record-header-controls">
        {sections.length >= 4 ? (
          <ActionMenu label="Jump to">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={activeId === section.id ? "is-active" : undefined}
                onClick={() => scrollToSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </ActionMenu>
        ) : null}
        {actions ? (
          <div className="sticky-record-header-actions">{actions}</div>
        ) : null}
        <button
          type="button"
          className={
            actions
              ? "btn btn-ghost sticky-record-header-desktop-only"
              : "btn btn-ghost"
          }
          onClick={backToTop}
        >
          Back to top
        </button>
        {actions ? (
          <div className="sticky-record-header-mobile-actions">
            <ActionMenu label="More">
              {actions}
              <button type="button" onClick={backToTop}>
                Back to top
              </button>
            </ActionMenu>
          </div>
        ) : null}
      </div>
    </div>
  );
}
