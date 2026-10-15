import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { XIcon } from "../../ui/icons";
import { guideForPath } from "./pageGuides";

/**
 * Page help on demand. A small round "?" sits at the top right of the page;
 * on hover it widens to say what it is (the ui-layouts "Hover Right" button,
 * MIT, see src/ui/ui-layouts.LICENSE.txt). A click opens the page's purpose
 * and tips in a small card under it. Nothing opens by itself: the full-width
 * strip that used to open on every new section is gone.
 */
export function PageGuide() {
  const { pathname } = useLocation();
  const guide = guideForPath(pathname);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardId = useId();

  useEffect(() => setOpen(false), [guide?.prefix]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      )
        return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!guide) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} className="relative z-20 mb-1 flex justify-end">
        <button
          type="button"
          className="group inline-flex h-8 max-w-8 cursor-pointer items-center overflow-hidden rounded-full border border-line bg-panel text-sm font-semibold text-ink-2 transition-[max-width,color,border-color] duration-300 hover:max-w-64 hover:border-line-2 hover:text-ink focus-visible:max-w-64 aria-expanded:max-w-64 aria-expanded:border-line-2 aria-expanded:text-ink"
          aria-label={`About ${guide.title}`}
          aria-expanded={open}
          aria-controls={cardId}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center">?</span>
          <span className="pr-3.5 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-aria-expanded:opacity-100">
            About {guide.title}
          </span>
        </button>
        <AnimatePresence>
          {open ? (
            <motion.aside
              id={cardId}
              aria-label={`About ${guide.title}`}
              className="absolute top-10 right-0 w-[min(24rem,calc(100vw-2rem))] rounded-md border border-line bg-panel p-4 text-sm text-ink-2 shadow-[0_16px_36px_-18px_rgb(15_15_17/0.4)]"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 leading-snug">
                  <strong className="font-semibold text-ink">
                    {guide.title}.
                  </strong>{" "}
                  {guide.purpose}
                </p>
                <button
                  type="button"
                  className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-xs text-ink-2 hover:bg-inset hover:text-ink"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <XIcon width={13} height={13} />
                </button>
              </div>
              {guide.steps.length > 0 ? (
                <ul className="mt-2 grid list-disc gap-1 pl-4">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              ) : null}
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
