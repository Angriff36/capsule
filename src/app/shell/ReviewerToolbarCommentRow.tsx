import { StatusChip } from "../../ui/primitives";
import type { Id } from "../../lib/api";

export type ReviewerToolbarComment = {
  _id: Id<"pageFeedbacks">;
  pagePath: string;
  pageTitle?: string | null;
  kind: string;
  body: string;
  status: string;
  leftAt?: number | null;
  leftByName?: string | null;
  issueUrl?: string | null;
  issueNumber?: number | null;
  issueDoneAt?: number | null;
  version?: number;
};

const KIND_LABEL: Record<string, string> = {
  improvement: "Improve",
  missing: "Missing",
  broken: "Broken",
};

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function commentSendChip(input: {
  addressing: boolean;
  working: boolean;
  fail?: string;
  sent: boolean;
  resolved: boolean;
  issueDone: boolean;
}): { status: string; color: string; label: string } | null {
  // Done only when the GitHub issue was finished; closing by hand is not Done.
  if (input.issueDone)
    return { status: "completed", color: "chip-tone-ok", label: "Done" };
  if (input.resolved)
    return {
      status: "cancelled",
      color: "chip-tone-mute",
      label: "Closed by hand",
    };
  if (input.addressing)
    return { status: "executing", color: "chip-tone-info", label: "Sending…" };
  if (input.fail)
    return {
      status: "cancelled",
      color: "chip-tone-danger",
      label: "Could not send",
    };
  if (input.working)
    return {
      status: "executing",
      color: "chip-tone-info",
      label: "Claude is working on this",
    };
  if (input.sent)
    return { status: "completed", color: "chip-tone-ok", label: "Sent" };
  return null;
}

export function ReviewerToolbarCommentRow(props: {
  row: ReviewerToolbarComment;
  here: boolean;
  focused: boolean;
  number?: number;
  offScreen: boolean;
  addressing: boolean;
  working: boolean;
  fail?: string;
  onShow: () => void;
  onAddress: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onRemove: () => void;
}) {
  const { row } = props;
  const chip = commentSendChip({
    addressing: props.addressing,
    working: props.working,
    fail: props.fail,
    sent: Boolean(row.issueUrl),
    resolved: row.status === "resolved",
    issueDone: row.status === "resolved" && row.issueDoneAt != null,
  });
  const addressLabel = props.addressing
    ? "Sending…"
    : row.issueUrl
      ? "Send again"
      : "Address this";

  return (
    <li
      className={`border-b border-line px-4 py-3 ${props.focused ? "bg-accent-soft" : ""}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        {props.number ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-brand">
            {props.number}
          </span>
        ) : null}
        <span className="font-semibold text-ink">
          {KIND_LABEL[row.kind] ?? row.kind}
        </span>
        <span>
          {row.leftByName ?? "An admin"}
          {row.leftAt ? ` · ${timeFormat.format(row.leftAt)}` : ""}
        </span>
        {row.status === "resolved" ? <span>· Closed</span> : null}
      </div>
      <p className="whitespace-pre-wrap">{row.body}</p>
      {chip ? (
        <p className="mt-2" aria-live="polite">
          <StatusChip
            status={chip.status}
            color={chip.color}
            label={chip.label}
          />
        </p>
      ) : null}
      {!props.here ? (
        <a
          href={row.pagePath}
          className="mt-1 block truncate text-xs text-accent-deep underline"
        >
          {row.pageTitle || row.pagePath}
        </a>
      ) : props.offScreen ? (
        <p className="mt-1 text-xs text-ink-3">
          The spot is not on the screen right now.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {props.here ? (
          <button type="button" className="underline" onClick={props.onShow}>
            Show
          </button>
        ) : null}
        {row.status === "open" ? (
          <button
            type="button"
            className="underline"
            disabled={props.addressing}
            aria-busy={props.addressing}
            onClick={props.onAddress}
          >
            {addressLabel}
          </button>
        ) : null}
        {row.issueUrl ? (
          <a
            href={row.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Issue #{row.issueNumber}
          </a>
        ) : null}
        {row.status === "open" ? (
          <button type="button" className="underline" onClick={props.onResolve}>
            Resolve
          </button>
        ) : (
          <button type="button" className="underline" onClick={props.onReopen}>
            Open again
          </button>
        )}
        <button
          type="button"
          className="text-danger underline"
          onClick={props.onRemove}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
