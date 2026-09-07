import { useClerk } from "@clerk/react";
import { Link, useLocation } from "react-router-dom";
import { formatDate } from "../../lib/format";
import {
  CalendarIcon,
  ClockIcon,
  HomeIcon,
  FlameIcon,
  UsersIcon,
  CheckIcon,
  WifiOffIcon,
} from "../../ui/icons";
import "./my-day.css";
import { PageHeader } from "../../ui/primitives";
import type { useQueuedActions } from "./offlineStore";

/**
 * Chrome around the My Day view: sticky identity header, page title, and the
 * content column. Phone-first, but `wide` lets the main view spread into a
 * desktop-friendly width instead of a phone column centered on a big screen.
 */
export function MyDayFrame({
  signedInName,
  linkedPersonName,
  onSwitchPerson,
  wide = false,
  weeklyHours,
  shiftCount,
  children,
}: {
  /** Clerk fullName / email — chip and PageHeader must never omit this. */
  signedInName?: string;
  /** Only when a Person is uniquely linked to this Clerk user.id. */
  linkedPersonName?: string;
  onSwitchPerson?: () => void;
  wide?: boolean;
  weeklyHours?: number;
  shiftCount?: number;
  children: React.ReactNode;
}) {
  const { signOut } = useClerk();
  const { hash } = useLocation();
  const identityLabel =
    signedInName && linkedPersonName && linkedPersonName !== signedInName
      ? `${signedInName} · ${linkedPersonName}`
      : (signedInName ?? "My Day");
  const identityLead = signedInName
    ? `${identityLabel} · ${formatDate(Date.now())}`
    : formatDate(Date.now());
  const navigation = [
    { id: "my-day-dashboard", label: "Dashboard", icon: HomeIcon },
    { id: "my-day-schedule", label: "My schedule", icon: CalendarIcon },
    { id: "my-day-timesheets", label: "Time clock", icon: ClockIcon },
    { id: "my-day-prep", label: "Prep lists", icon: FlameIcon },
    { id: "my-day-availability", label: "Availability", icon: UsersIcon },
  ];
  return (
    <div className="my-day-app">
      <a className="my-day-skip" href="#my-day-content">
        Skip to My Day
      </a>
      <aside className="my-day-sidebar" aria-label="Staff workspace">
        <Link to="/" className="my-day-brand">
          <span aria-hidden="true">C</span>Capsule
        </Link>
        <div className="my-day-profile">
          <div className="my-day-profile-identity">
            <span className="my-day-avatar" aria-hidden="true">
              {identityLabel.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{identityLabel}</strong>
              <p>My staff workspace</p>
            </div>
          </div>
          {wide && (
            <div className="my-day-profile-stats">
              <div>
                <strong>
                  {weeklyHours == null
                    ? "—"
                    : `${weeklyHours.toLocaleString([], { maximumFractionDigits: 1 })}h`}
                </strong>
                <span>Recorded this week</span>
              </div>
              <div>
                <strong>{shiftCount ?? "—"}</strong>
                <span>Upcoming shifts</span>
              </div>
            </div>
          )}
          {onSwitchPerson && (
            <button
              type="button"
              className="my-day-text-action"
              onClick={onSwitchPerson}
            >
              Switch staff profile
            </button>
          )}
        </div>
        {wide && (
          <nav className="my-day-nav" aria-label="My Day">
            {navigation.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={
                  (hash || "#my-day-dashboard") === `#${id}`
                    ? "location"
                    : undefined
                }
              >
                <Icon aria-hidden="true" />
                {label}
              </a>
            ))}
            <Link to="/staff/messages">
              <UsersIcon aria-hidden="true" />
              Messages
            </Link>
          </nav>
        )}
        <div className="my-day-sidebar-footer">
          <Link to="/">
            Full app <span aria-hidden="true">↗</span>
          </Link>
          <button
            type="button"
            onClick={() => void signOut({ redirectUrl: "/" })}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main
        id="my-day-content"
        tabIndex={-1}
        className={`my-day-main ${wide ? "max-w-md md:max-w-5xl" : "max-w-md"}`}
      >
        <div id="my-day-dashboard">
          <PageHeader title="My Day" lead={identityLead} />
        </div>
        {children}
      </main>
    </div>
  );
}

export function OfflineStatusBar({
  online,
  pending,
  onRetry,
}: {
  online: boolean;
  pending: ReturnType<typeof useQueuedActions>;
  onRetry: () => void;
}) {
  if (pending.length === 0) {
    if (!online) {
      return (
        <div
          role="status"
          data-testid="offline-banner"
          className="flex items-center gap-2 rounded-xs border border-warn/30 bg-warn-soft px-3 py-2 text-sm font-medium text-warn"
        >
          <WifiOffIcon width={13} height={13} />
          Offline — showing the last synced data.
        </div>
      );
    }
    return null;
  }

  const failed = pending.find((action) => action.lastError);
  const failedCount = pending.filter((action) => action.lastError).length;
  return (
    <div
      role="status"
      data-testid="offline-pending"
      className="flex flex-col gap-1.5 rounded-xs border border-brand/30 bg-brand-soft px-3 py-2.5 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-brand">
          {!online ? (
            "Offline"
          ) : failed ? (
            "Couldn't sync"
          ) : (
            <span className="inline-flex items-center gap-1">
              <CheckIcon width={12} height={12} /> All set
            </span>
          )}
          {" — "}
          {pending.length} action{pending.length === 1 ? "" : "s"} queued
        </p>
        {online ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm py-1"
            onClick={onRetry}
          >
            {failed ? "Retry" : "Sync now"}
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-0.5 text-ink-2">
        {pending.slice(0, 3).map((action) => (
          <li key={action.id} className="truncate">
            {action.label}
            {action.lastError ? " — failed, will retry" : ""}
          </li>
        ))}
        {pending.length > 3 ? (
          <li className="text-ink-3">+{pending.length - 3} more</li>
        ) : null}
      </ul>
      {failed && failedCount > 0 ? (
        <p className="text-ink-3">
          {failedCount} action{failedCount === 1 ? "" : "s"} couldn't sync and
          will retry when you reconnect.
        </p>
      ) : null}
    </div>
  );
}
