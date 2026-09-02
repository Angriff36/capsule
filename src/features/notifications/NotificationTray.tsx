import { useQuery } from "convex/react";
import { useCallback, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { relativeDays } from "../../lib/format";
import { BellIcon } from "../../ui/icons";
import { useDismissibleMenu } from "../../ui/useDismissibleMenu";
import {
  type AppNotification,
  NOTIFICATION_KIND_LABELS,
} from "./deriveNotifications";

// ponytail: read state is a localStorage id set (per browser, not per account
// across devices). Move to a Notification entity + manifest commands if
// cross-device read sync ever matters.
const READ_STORAGE_KEY = "capsule.notifications.read";
const NO_NOTIFICATIONS: AppNotification[] = [];

function loadReadIds(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** Persist only ids still visible — resolved notifications self-clean. */
function saveReadIds(read: ReadonlySet<string>, visibleIds: string[]) {
  try {
    localStorage.setItem(
      READ_STORAGE_KEY,
      JSON.stringify(visibleIds.filter((id) => read.has(id))),
    );
  } catch {
    // Storage unavailable (private mode) — read state just won't persist.
  }
}

export function NotificationTray() {
  // One server query (convex/notifications.ts) instead of twelve whole-table
  // subscriptions: a re-auth or reconnect now costs one call, not twelve.
  const notifications =
    useQuery(api.notifications.listNotifications) ?? NO_NOTIFICATIONS;

  const [readIds, setReadIds] = useState<ReadonlySet<string>>(loadReadIds);
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markRead = useCallback(
    (ids: string[]) => {
      setReadIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        saveReadIds(
          next,
          notifications.map((n) => n.id),
        );
        return next;
      });
    },
    [notifications],
  );

  const trayRef = useDismissibleMenu();
  const closeTray = (e: MouseEvent) => {
    (e.currentTarget as HTMLElement)
      .closest("details")
      ?.removeAttribute("open");
  };

  return (
    <details ref={trayRef} className="group relative">
      <summary
        className="relative flex h-8 cursor-pointer list-none items-center gap-2 rounded-xs border border-transparent px-2 text-ink-2 group-open:border-line-2 group-open:bg-inset hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-2xs leading-none font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </summary>
      <div className="absolute top-9.5 right-0 z-30 w-80 rounded-sm border border-line-2 bg-panel p-3 shadow-[0_6px_24px_-8px_rgba(34,30,22,0.25)]">
        <div className="flex items-center justify-between">
          <p className="font-medium">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markRead(notifications.map((n) => n.id))}
              className="cursor-pointer text-xs font-medium text-brand hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
            Nothing needs your attention right now.
          </p>
        ) : (
          <ul className="mt-2 max-h-96 space-y-0.5 overflow-y-auto">
            {notifications.slice(0, 50).map((n) => {
              const unread = !readIds.has(n.id);
              return (
                <li key={n.id}>
                  <Link
                    to={n.link}
                    onClick={(e) => {
                      markRead([n.id]);
                      closeTray(e);
                    }}
                    className="block rounded-xs px-2 py-1.5 transition-colors hover:bg-inset"
                  >
                    <span className="flex items-center gap-1.5 text-2xs text-ink-3">
                      {unread && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                          aria-label="Unread"
                        />
                      )}
                      {NOTIFICATION_KIND_LABELS[n.kind]} · {relativeDays(n.at)}
                    </span>
                    <span
                      className={`mt-0.5 block text-sm leading-snug ${unread ? "font-medium text-ink" : "text-ink-2"}`}
                    >
                      {n.message}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
