import { Fragment, type FormEvent } from "react";
import type { Doc } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import { ActionMenu, ActionMenuRule, StatusChip } from "../../ui/primitives";
import { CheckCircleIcon } from "../../ui/icons";
import { eventGuestPolicy } from "./EventGuestPolicy";
import { guestTableLabel } from "./guestTableLabel";

export type GuestRowAction = "decline" | "table" | "withdraw";

type Props = {
  guest: Doc<"eventGuests">;
  isBusy: boolean;
  openAction: GuestRowAction | null;
  onConfirm: () => void;
  onCheckIn: () => void;
  onOpenAction: (kind: GuestRowAction) => void;
  onCloseAction: () => void;
  onSubmitAction: (kind: GuestRowAction, value: string) => void;
};

function actionLabel(kind: GuestRowAction, guestName: string): string {
  if (kind === "table") return `Table assignment for ${guestName}`;
  return kind === "decline" ? "Decline reason (optional)" : "Withdrawal reason";
}

/**
 * One guest in the attendance ledger. Presentation and row-level intent
 * only — the panel owns the queries and the generated EventGuest commands,
 * and `eventGuestPolicy` still decides what is legal right now.
 */
export function EventGuestRow({
  guest,
  isBusy,
  openAction,
  onConfirm,
  onCheckIn,
  onOpenAction,
  onCloseAction,
  onSubmitAction,
}: Props) {
  const dietary = (guest.dietaryRestrictions ?? []).filter(Boolean);
  const allergens = (guest.allergenRestrictions ?? []).filter(Boolean);
  const access = (guest.accessibilityNeeds ?? []).filter(Boolean);

  return (
    <Fragment>
      <tr>
        <td className="td py-2.5">
          <span className="block font-medium text-ink">{guest.name}</span>
          {access.length ? (
            <span className="block text-sm text-ink-3">
              {access.join(" · ")}
            </span>
          ) : null}
        </td>
        <td className="td text-sm text-ink-2">
          {guest.email ?? guest.phone ?? "—"}
        </td>
        <td className="td">
          <StatusChip status={guest.rsvpStatus} />
        </td>
        <td className="td">
          {guest.checkedInAt != null ? (
            <span className="font-mono text-xs text-ok">
              {formatDate(guest.checkedInAt)} {formatTime(guest.checkedInAt)}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!eventGuestPolicy.canCheckIn(guest) || isBusy}
              onClick={onCheckIn}
            >
              Check in
            </button>
          )}
        </td>
        <td className="td text-sm text-ink-2">
          {dietary.length ? dietary.join(", ") : "—"}
        </td>
        <td className="td">
          {allergens.length ? (
            <span className="chip border-warn/40 bg-warn-soft text-warn">
              {allergens.join(", ")}
            </span>
          ) : (
            <span className="text-sm text-ink-3">—</span>
          )}
        </td>
        <td className="td">
          {guest.specialMealRequired ? (
            <CheckCircleIcon
              width={15}
              height={15}
              className="text-info"
              aria-label="Special meal required"
            />
          ) : (
            <span className="text-sm text-ink-3">—</span>
          )}
        </td>
        <td className="td text-sm text-ink">
          {guest.tableAssignment ? (
            guestTableLabel(guest.tableAssignment)
          ) : (
            <span className="text-ink-3">Unassigned</span>
          )}
        </td>
        <td className="td text-right">
          <ActionMenu>
            <button
              type="button"
              disabled={!eventGuestPolicy.canConfirm(guest) || isBusy}
              onClick={onConfirm}
            >
              Confirm RSVP
            </button>
            <button
              type="button"
              disabled={!eventGuestPolicy.canDecline(guest) || isBusy}
              onClick={() => onOpenAction("decline")}
            >
              Decline RSVP
            </button>
            <button
              type="button"
              disabled={!eventGuestPolicy.canAssignTable(guest) || isBusy}
              onClick={() => onOpenAction("table")}
            >
              Assign table
            </button>
            <ActionMenuRule />
            <button
              type="button"
              className="action-menu-danger"
              disabled={!eventGuestPolicy.canWithdraw(guest) || isBusy}
              onClick={() => onOpenAction("withdraw")}
            >
              Withdraw guest
            </button>
          </ActionMenu>
        </td>
      </tr>
      {openAction ? (
        <tr>
          <td className="td bg-inset" colSpan={9}>
            <form
              className="flex flex-wrap items-end gap-2 py-2"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const value = String(
                  new FormData(event.currentTarget).get("value") ?? "",
                ).trim();
                if (openAction !== "decline" && !value) return;
                onSubmitAction(openAction, value);
              }}
            >
              <label className="field-label min-w-0 flex-1 basis-48">
                {actionLabel(openAction, guest.name)}
                <input
                  name="value"
                  className="input"
                  required={openAction !== "decline"}
                  autoFocus
                />
              </label>
              <button className="btn btn-primary btn-sm" disabled={isBusy}>
                Apply
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onCloseAction}
              >
                Dismiss
              </button>
            </form>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
