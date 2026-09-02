import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { relativeDays } from "../../lib/format";
import { useRecents } from "../../lib/recents";
import { ClockIcon } from "../../ui/icons";
import { useDismissibleMenu } from "../../ui/useDismissibleMenu";

/** Quick-access dropdown of the last ~20 records the user opened. */
export function RecentsMenu() {
  const recents = useRecents();
  const menuRef = useDismissibleMenu();

  const closeMenu = (e: MouseEvent) => {
    (e.currentTarget as HTMLElement)
      .closest("details")
      ?.removeAttribute("open");
  };

  return (
    <details ref={menuRef} className="group relative">
      <summary
        className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-xs border border-transparent px-2 text-ink-2 group-open:border-line-2 group-open:bg-inset hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label="Recently opened records"
      >
        <ClockIcon />
      </summary>
      <div className="absolute top-9.5 right-0 z-30 w-72 rounded-sm border border-line-2 bg-panel p-3 shadow-[0_6px_24px_-8px_rgba(34,30,22,0.25)]">
        <p className="font-medium">Recently opened</p>
        {recents.length === 0 ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
            Records you open will show up here for quick access.
          </p>
        ) : (
          <ul className="mt-2 max-h-96 space-y-0.5 overflow-y-auto">
            {recents.map((r) => (
              <li key={r.path}>
                <Link
                  to={r.path}
                  onClick={closeMenu}
                  className="block rounded-xs px-2 py-1.5 transition-colors hover:bg-inset"
                >
                  <span className="text-2xs tracking-wider text-ink-3 uppercase">
                    {r.type} · {relativeDays(r.at)}
                  </span>
                  <span className="mt-0.5 block truncate text-sm leading-snug text-ink-2">
                    {r.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
