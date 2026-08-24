import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMobileViewport } from "../shell/useMobileViewport";
import { XIcon } from "../../ui/icons";
import { guideForPath } from "./pageGuides";

const seenKey = (prefix: string) => `capsule-guide-seen:${prefix}`;

/**
 * Compact onboarding: one line of purpose plus the tips, shown once per
 * section on desktop until dismissed. On phones nothing opens by itself —
 * a small "?" button reveals the same line on demand.
 */
export function PageGuide() {
  const { pathname } = useLocation();
  const guide = guideForPath(pathname);
  const mobile = useMobileViewport();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!guide) return;
    setOpen(!mobile && localStorage.getItem(seenKey(guide.prefix)) == null);
  }, [guide?.prefix, mobile]);

  if (!guide) return null;

  const dismiss = () => {
    localStorage.setItem(seenKey(guide.prefix), "1");
    setOpen(false);
  };

  if (!open) {
    if (!mobile) return null;
    return (
      <button
        type="button"
        className="fixed top-[72px] right-3 z-20 grid h-8 w-8 place-items-center rounded-full border border-line bg-panel text-sm font-bold text-ink-2 shadow-[0_2px_8px_-2px_rgb(30_40_36/0.2)]"
        aria-label={`About ${guide.title}`}
        title={`About ${guide.title}`}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
    );
  }

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
        onClick={mobile ? () => setOpen(false) : dismiss}
      >
        <XIcon width={13} height={13} />
      </button>
    </aside>
  );
}
