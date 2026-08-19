import { Link } from "react-router-dom";
import { formatDate } from "../../lib/format";
import { CheckIcon, WifiOffIcon } from "../../ui/icons";
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
  children,
}: {
  /** Clerk fullName / email — chip and PageHeader must never omit this. */
  signedInName?: string;
  /** Only when a Person is uniquely linked to this Clerk user.id. */
  linkedPersonName?: string;
  onSwitchPerson?: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const identityLabel =
    signedInName && linkedPersonName && linkedPersonName !== signedInName
      ? `${signedInName} · ${linkedPersonName}`
      : (signedInName ?? "My Day");
  const identityLead = signedInName
    ? `${identityLabel} · ${formatDate(Date.now())}`
    : formatDate(Date.now());
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-line-2 bg-canvas px-4 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-xs bg-accent font-mono text-sm font-bold text-white">
          C
        </span>
        <p className="min-w-0 flex-1 truncate text-base leading-tight font-semibold">
          {identityLabel}
        </p>
        {onSwitchPerson ? (
          <button
            className="btn btn-ghost btn-sm py-2 max-sm:min-h-9"
            onClick={onSwitchPerson}
          >
            Switch
          </button>
        ) : null}
        <Link className="btn btn-ghost btn-sm py-2 max-sm:min-h-9" to="/">
          Full app
        </Link>
      </header>
      <main
        className={`mx-auto flex w-full flex-col gap-4 px-4 py-5 pb-16 ${
          wide ? "max-w-md md:max-w-5xl" : "max-w-md"
        }`}
      >
        <PageHeader title="My Day" lead={identityLead} />
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
