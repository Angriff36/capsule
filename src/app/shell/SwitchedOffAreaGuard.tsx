import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { EmptyState } from "../../ui/EmptyState";
import { orgCapabilityNavPolicy } from "../navigation/OrgCapabilityNavPolicy";

/**
 * A switched-off area is hidden from the menu; a typed or saved address
 * must say so too, instead of opening a page that shows nothing.
 */
export function SwitchedOffAreaGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  if (
    orgCapabilityNavPolicy.isPathEnabled(
      pathname,
      authStatus?.disabledCapabilities,
    )
  ) {
    return children;
  }
  return (
    <div className="card">
      <EmptyState
        title="This area is switched off"
        hint="Your company turned this part of Capsule off. An admin can turn it back on under Settings, Permissions."
        action={
          <Link to="/admin" className="btn btn-ghost btn-sm">
            Open Permissions
          </Link>
        }
      />
    </div>
  );
}
