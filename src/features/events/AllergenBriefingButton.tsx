import { Link, useLocation } from "react-router-dom";

/** Hash the event page answers by opening the allergen briefing panel. */
export const ALLERGEN_BRIEFING_HASH = "#allergen-briefing";

/**
 * Opens the allergen briefing as a side panel over the current event page,
 * not a separate screen. Printing is one click further, inside the panel.
 */
export function AllergenBriefingButton({
  className = "btn btn-ghost",
  children = "Allergen briefing",
}: {
  readonly className?: string;
  readonly children?: React.ReactNode;
}) {
  const { pathname, search } = useLocation();
  return (
    <Link
      className={className}
      to={`${pathname}${search}${ALLERGEN_BRIEFING_HASH}`}
    >
      {children}
    </Link>
  );
}
