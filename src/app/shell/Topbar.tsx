import { UserButton, useUser } from "@clerk/react";
import { useQuery } from "convex/react";
import { Link, useLocation } from "react-router-dom";
import { NotificationTray } from "../../features/notifications/NotificationTray";
import { api } from "../../lib/api";
import { WORKSPACE_NAME } from "../../lib/workspace";
import { ChevronRightIcon, GearIcon, SearchIcon } from "../../ui/icons";
import { useDismissibleMenu } from "../../ui/useDismissibleMenu";
import { navigationCatalog } from "../navigation/NavigationCatalog";
import { breadcrumbsForPath, type Breadcrumb } from "./breadcrumbs";
import { RecentsMenu } from "./RecentsMenu";
import { ThemeToggle } from "./Sidebar";

function useBreadcrumbs(): Breadcrumb[] {
  const { pathname } = useLocation();
  return breadcrumbsForPath(pathname);
}

export function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const crumbs = useBreadcrumbs();
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const mobileAreas = navigationCatalog.availableAreas(
    authStatus?.disabledCapabilities,
  );
  // Phone "Menu": every workspace the role can reach (the rail is hidden
  // below 768px) plus the theme toggle that otherwise lives in the rail foot.
  const mobileMenuRef = useDismissibleMenu({ closeOnSelect: true });
  return (
    <header className="app-shell-header flex h-16 shrink-0 items-center gap-3 border-b border-line/70 bg-panel/95 px-5 max-sm:px-3">
      <Link
        to="/"
        className="mr-1 hidden h-8 w-8 place-items-center rounded-full bg-brand font-display text-xl text-white max-md:grid"
        aria-label="Capsule home"
      >
        C
      </Link>
      <details
        ref={mobileMenuRef}
        className="group relative hidden max-md:block"
      >
        <summary className="flex h-8 cursor-pointer list-none items-center rounded-xs border border-line px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-inset [&::-webkit-details-marker]:hidden">
          Menu
        </summary>
        <nav
          aria-label="Mobile primary"
          className="absolute top-10 left-0 z-30 w-44 rounded-sm border border-line-2 bg-panel p-1.5 shadow-[0_12px_32px_-12px_rgba(34,30,22,0.3)]"
        >
          {mobileAreas.map((area) => (
            <Link
              key={area.path}
              to={area.path}
              className="flex h-9 items-center gap-2.5 rounded-xs px-2.5 text-sm text-ink-2 transition-colors hover:bg-inset hover:text-ink"
            >
              <area.icon />
              {area.label}
            </Link>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            <ThemeToggle />
          </div>
        </nav>
      </details>
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1.5 max-sm:hidden"
      >
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex items-center gap-1.5 truncate">
            {i > 0 && (
              <ChevronRightIcon
                className="shrink-0 text-ink-3"
                width={11}
                height={11}
              />
            )}
            {c.to && i < crumbs.length - 1 ? (
              <Link
                to={c.to}
                className="text-ink-2 hover:text-ink hover:underline"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={
                  i === crumbs.length - 1 ? "font-medium" : "text-ink-2"
                }
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-9 w-64 cursor-pointer items-center gap-2 rounded-full border border-line bg-canvas/70 px-3.5 text-ink-3 transition-all duration-150 hover:border-brand/40 hover:bg-panel max-lg:w-48 max-sm:w-9 max-sm:justify-center max-sm:px-0"
        >
          <SearchIcon className="shrink-0" />
          <span className="truncate whitespace-nowrap max-sm:hidden">
            Search events, clients, invoices…
          </span>
          <span className="kbd ml-auto shrink-0 whitespace-nowrap max-sm:hidden">
            Ctrl K
          </span>
        </button>

        <RecentsMenu />

        <NotificationTray />

        <AccountMenu />
      </div>
    </header>
  );
}

/** Clerk user menu. Authorization stays server-side (linked Person). */
function AccountMenu() {
  const { user } = useUser();
  return (
    <div className="flex items-center gap-2 pl-1.5">
      <div className="text-right max-sm:hidden">
        <p className="max-w-40 truncate text-sm leading-tight font-medium">
          {user?.fullName ??
            user?.primaryEmailAddress?.emailAddress ??
            "Account"}
        </p>
        <p className="text-2xs leading-tight text-ink-3">{WORKSPACE_NAME}</p>
      </div>
      <Link
        to="/settings/email"
        aria-label="Email notification settings"
        title="Email notification settings"
        className="grid h-8 w-8 place-items-center rounded-xs border border-transparent text-ink-3 transition-colors hover:border-line-2 hover:bg-inset hover:text-ink"
      >
        <GearIcon width={15} height={15} />
      </Link>
      <UserButton />
    </div>
  );
}
