import { Link, NavLink, useLocation } from "react-router-dom";
import { useActiveNavLinkInView } from "../lib/useActiveNavLinkInView";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./DropdownMenu";
import { ChevronDownIcon } from "./icons";

export type WorkspaceTab = { label: string; path: string; end?: boolean };

/**
 * An area's tab strip: the daily destinations stay visible, the occasional
 * ones sit under one "More" menu. "More" reads as active when the open page
 * is one of its items, so the strip always shows where you are.
 */
export function WorkspaceTabs({
  label,
  tabs,
  more = [],
}: {
  label: string;
  tabs: readonly WorkspaceTab[];
  more?: readonly WorkspaceTab[];
}) {
  const navRef = useActiveNavLinkInView<HTMLElement>();
  const { pathname } = useLocation();
  const activeMore = more.find((tab) =>
    tab.end ? pathname === tab.path : pathname.startsWith(tab.path),
  );
  return (
    <nav className="kitchen-book-nav" ref={navRef} aria-label={label}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.end}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {tab.label}
        </NavLink>
      ))}
      {more.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`workspace-tabs-more${activeMore ? " active" : ""}`}
            >
              {activeMore ? activeMore.label : "More"}
              <ChevronDownIcon width={12} height={12} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {more.map((tab) => (
              <DropdownMenuItem key={tab.path} asChild>
                <Link to={tab.path}>{tab.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
}
