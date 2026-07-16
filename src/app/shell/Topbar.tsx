import { Link, useLocation } from "react-router-dom";
import { WORKSPACE_NAME } from "../../lib/workspace";
import { BellIcon, ChevronRightIcon, SearchIcon } from "../../ui/icons";
import { navigationCatalog } from "../navigation/NavigationCatalog";
import { NAV_AREAS } from "../nav";

function useBreadcrumbs(): Array<{ label: string; to?: string }> {
  const { pathname } = useLocation();
  if (pathname === "/") return [{ label: "Home" }];
  if (pathname.startsWith("/kitchen")) {
    const crumbs: Array<{ label: string; to?: string }> = [
      { label: "Kitchen", to: "/kitchen" },
    ];
    if (pathname === "/kitchen") {
      crumbs.push({ label: "Kitchen" });
    }
    return crumbs;
  }
  const area = navigationCatalog.areaForPath(pathname);
  if (!area) return [{ label: "Capsule" }];
  const crumbs: Array<{ label: string; to?: string }> = [
    { label: area.label, to: area.path },
  ];
  if (pathname === `${area.path}/new`) crumbs.push({ label: "New" });
  else if (pathname !== area.path) crumbs.push({ label: "Detail" });
  return crumbs;
}

function Popover({
  button,
  label,
  children,
}: {
  button: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group relative">
      <summary
        className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-xs border border-transparent px-2 text-ink-2 group-open:border-line-2 group-open:bg-inset hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={label}
      >
        {button}
      </summary>
      <div className="absolute top-9.5 right-0 z-30 w-64 rounded-sm border border-line-2 bg-panel p-3 shadow-[0_6px_24px_-8px_rgba(34,30,22,0.25)]">
        {children}
      </div>
    </details>
  );
}

export function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const crumbs = useBreadcrumbs();
  return (
    <header className="app-shell-header flex h-16 shrink-0 items-center gap-3 border-b border-line/70 bg-panel/95 px-5 max-sm:px-3">
      <Link
        to="/"
        className="mr-1 hidden h-8 w-8 place-items-center rounded-full bg-brand font-display text-[17px] text-white max-md:grid"
        aria-label="Capsule home"
      >
        C
      </Link>
      <details className="group relative hidden max-md:block">
        <summary className="flex h-8 cursor-pointer list-none items-center rounded-xs border border-line px-2.5 text-[11px] font-medium text-ink-2 transition-colors hover:bg-inset [&::-webkit-details-marker]:hidden">
          Menu
        </summary>
        <nav
          aria-label="Mobile primary"
          className="absolute top-10 left-0 z-30 w-44 rounded-sm border border-line-2 bg-panel p-1.5 shadow-[0_12px_32px_-12px_rgba(34,30,22,0.3)]"
        >
          {NAV_AREAS.filter((area) => !area.planned).map((area) => (
            <Link
              key={area.path}
              to={area.path}
              className="flex h-9 items-center gap-2.5 rounded-xs px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-inset hover:text-ink"
            >
              <area.icon />
              {area.label}
            </Link>
          ))}
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
            Find an event or area…
          </span>
          <span className="kbd ml-auto shrink-0 whitespace-nowrap max-sm:hidden">
            Ctrl K
          </span>
        </button>

        <Popover label="Notifications" button={<BellIcon />}>
          <p className="font-medium">Notifications</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
            Nothing unread. Activity feeds arrive with later product slices.
          </p>
        </Popover>

        <WorkspaceAccountPlaceholder />
      </div>
    </header>
  );
}

/** Auth UI lands in the authentication/org flow — shell shows workspace chrome only. */
function WorkspaceAccountPlaceholder() {
  return (
    <div className="flex items-center gap-2 pl-1.5">
      <div className="text-right max-sm:hidden">
        <p className="max-w-40 truncate text-[12px] leading-tight font-medium">
          Account
        </p>
        <p className="text-[10.5px] leading-tight text-ink-3">{WORKSPACE_NAME}</p>
      </div>
      <span
        className="grid h-8 w-8 place-items-center rounded-full border border-line-2 bg-inset text-[11px] font-semibold text-ink-2"
        aria-hidden="true"
      >
        C
      </span>
    </div>
  );
}
