import { NavLink, useLocation } from "react-router-dom";
import { useActiveNavLinkInView } from "../../lib/useActiveNavLinkInView";
import { CLIENTS_PIPELINE_SECTION, CLIENTS_SECTIONS } from "./clientsRoutes";

export function ClientsWorkspaceNav() {
  const navRef = useActiveNavLinkInView<HTMLElement>();
  // A client's own page (/clients/<id>) belongs to Accounts.
  const { pathname } = useLocation();
  const onClientPage =
    /^\/clients\/[^/]+$/.test(pathname) &&
    ![CLIENTS_PIPELINE_SECTION, ...CLIENTS_SECTIONS].some(
      (section) => section.path === pathname,
    );
  return (
    <nav
      className="kitchen-book-nav"
      ref={navRef}
      aria-label="Clients workspace"
    >
      {[CLIENTS_PIPELINE_SECTION, ...CLIENTS_SECTIONS].map((section) => (
        <NavLink
          key={section.key}
          to={section.path}
          // "accounts" (/clients) and "proposals" (/clients/proposals) are
          // prefixes of sibling tabs — without `end` two underlines light up
          // at once (e.g. on /clients/proposals/templates).
          end={section.key === "accounts" || section.key === "proposals"}
          className={({ isActive }) =>
            isActive || (onClientPage && section.key === "accounts")
              ? "active"
              : undefined
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
