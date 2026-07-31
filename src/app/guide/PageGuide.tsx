import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { guideForPath } from "./pageGuides";

const seenKey = (prefix: string) => `capsule-guide-seen:${prefix}`;

/**
 * "What's this page?" — a plain-language purpose card for every screen.
 * Opens automatically the first time someone lands on a section, then stays
 * available as a small pill. Presentation only; remembers dismissal per
 * section in localStorage.
 */
export function PageGuide() {
  const { pathname } = useLocation();
  const guide = guideForPath(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!guide) return;
    setOpen(localStorage.getItem(seenKey(guide.prefix)) == null);
  }, [guide?.prefix]);

  if (!guide) return null;

  const dismiss = () => {
    localStorage.setItem(seenKey(guide.prefix), "1");
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          className="btn btn-ghost btn-sm text-ink-3"
          onClick={() => setOpen(true)}
        >
          <span
            aria-hidden="true"
            className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-2xs font-semibold"
          >
            ?
          </span>
          What's this page?
        </button>
      </div>
    );
  }

  return (
    <aside
      className="mb-4 rounded-sm border border-brand/25 bg-brand-soft/50 px-4 py-3"
      aria-label={`About ${guide.title}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-brand">
            {guide.title} — what this page is for
          </p>
          <p className="mt-1 max-w-3xl text-base leading-relaxed text-ink">
            {guide.purpose}
          </p>
          <ol className="mt-2 max-w-3xl space-y-1 text-sm leading-relaxed text-ink-2">
            {guide.steps.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="font-mono text-xs text-brand">
                  {index + 1}.
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={dismiss}
        >
          Got it
        </button>
      </div>
    </aside>
  );
}
