import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { XIcon } from "../../ui/icons";
import { guideForPath } from "./pageGuides";

const seenKey = (prefix: string) => `capsule-guide-seen:${prefix}`;

/**
 * Compact first-visit onboarding: one line of purpose plus the three tips,
 * shown once per section until dismissed. After that it is gone — the screen
 * itself has to be understandable. Remembers dismissal per section.
 */
export function PageGuide() {
  const { pathname } = useLocation();
  const guide = guideForPath(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!guide) return;
    setOpen(localStorage.getItem(seenKey(guide.prefix)) == null);
  }, [guide?.prefix]);

  if (!guide || !open) return null;

  const dismiss = () => {
    localStorage.setItem(seenKey(guide.prefix), "1");
    setOpen(false);
  };

  return (
    <aside
      className="mb-3 flex items-start gap-3 rounded-sm border border-info/30 bg-info-soft px-3 py-2 text-sm text-ink"
      aria-label={`About ${guide.title}`}
    >
      <p className="min-w-0 flex-1 leading-snug">
        <strong className="font-semibold">{guide.title}.</strong>{" "}
        {guide.purpose}{" "}
        <span className="text-ink-2">{guide.steps.join(" · ")}</span>
      </p>
      <button
        type="button"
        className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-xs text-ink-2 hover:bg-panel hover:text-ink"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={dismiss}
      >
        <XIcon width={13} height={13} />
      </button>
    </aside>
  );
}
