import { useEffect, useState, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MERGED_SECTION_OPEN } from "./MergedSection";

type Jump = { id: string; title: string };

function readJumps(root: HTMLElement): Jump[] {
  return [...root.querySelectorAll<HTMLElement>(".merged-section")].map(
    (section) => ({
      id: section.id,
      title:
        section.querySelector(".merged-section-title")?.textContent?.trim() ??
        section.id,
    }),
  );
}

/**
 * Pinned "On this page" strip for pages that hold folded screens
 * (MergedSection). One click opens and scrolls to any part, so a long page
 * never means hunting by scrolling. It shows only after you scroll down, and
 * never on a page without parts.
 */
export function OnThisPage({
  rootRef,
  scrollRef,
}: {
  rootRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const [jumps, setJumps] = useState<Jump[]>([]);
  // Hidden at the top of the page (the parts are right there); it pins in
  // once you scroll past the page header.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > 320);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [scrollRef]);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      const next = readJumps(root);
      setJumps((current) =>
        current.length === next.length &&
        current.every(
          (jump, i) => jump.id === next[i]?.id && jump.title === next[i]?.title,
        )
          ? current
          : next,
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [rootRef, pathname]);

  if (jumps.length === 0 || !scrolled) return null;

  const go = (id: string) => {
    const section = document.getElementById(id);
    section?.dispatchEvent(new CustomEvent(MERGED_SECTION_OPEN));
    navigate({ pathname, search, hash: id }, { replace: true });
    window.setTimeout(() => section?.scrollIntoView({ block: "start" }), 0);
  };

  return (
    // A zero-height pin: the bar floats over the page, so showing it on
    // scroll never moves the content under the reader.
    <div className="on-this-page-pin">
      <nav className="on-this-page" aria-label="On this page">
        <span className="on-this-page-label">On this page</span>
        <button
          type="button"
          onClick={() => {
            navigate({ pathname, search }, { replace: true });
            scrollRef.current?.scrollTo({ top: 0 });
          }}
        >
          Top
        </button>
        {jumps.map((jump) => (
          <button key={jump.id} type="button" onClick={() => go(jump.id)}>
            {jump.title}
          </button>
        ))}
      </nav>
    </div>
  );
}
