import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useEventGuestAssignTable,
  useEventGuestCheckIn,
  useEventGuestRsvpConfirm,
  useEventGuestRsvpDecline,
  useEventGuestWithdraw,
  useCreateEventGuest,
} from "../../lib/manifest-convex-react";
import { EmptyState, Section, Skeleton, StatusChip } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { eventGuestPolicy } from "./EventGuestPolicy";
import { FailureBanner } from "./FailureBanner";

type GuestAction = {
  kind: "decline" | "table" | "withdraw";
  guestId: Id<"eventGuests">;
} | null;

const optional = (value: string) => value.trim() || undefined;
function list(value: string): string[] | undefined {
  const values = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

export function EventGuestPanel({ eventId }: { eventId: Id<"events"> }) {
  const eventGuests = useQuery(api.queries.listEventGuestByEventId, {
    eventId,
  });
  const invite = useCreateEventGuest();
  const confirm = useEventGuestRsvpConfirm();
  const decline = useEventGuestRsvpDecline();
  const checkIn = useEventGuestCheckIn();
  const assignTable = useEventGuestAssignTable();
  const withdraw = useEventGuestWithdraw();
  const [showInvite, setShowInvite] = useState(false);
  const [action, setAction] = useState<GuestAction>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const guests = useMemo(
    () =>
      (eventGuests ?? [])
        .filter((guest) => guest.invitedAt != null && guest.deletedAt == null)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [eventGuests],
  );

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
      setAction(null);
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("invite", async () => {
      await invite({
        eventId,
        name: String(data.get("name") ?? "").trim(),
        email: optional(String(data.get("email") ?? "")),
        phone: optional(String(data.get("phone") ?? "")),
        dietaryRestrictions: list(
          String(data.get("dietaryRestrictions") ?? ""),
        ),
        allergenRestrictions: list(
          String(data.get("allergenRestrictions") ?? ""),
        ),
        accessibilityNeeds: list(String(data.get("accessibilityNeeds") ?? "")),
        specialMealRequired: data.get("specialMealRequired") === "on",
      });
      form.reset();
      setShowInvite(false);
    });
  };

  return (
    <Section
      title="Guests"
      count={guests.length}
      actions={
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowInvite((value) => !value)}
        >
          {showInvite ? "Dismiss" : "Invite guest"}
        </button>
      }
    >
      <div className="space-y-3 p-3">
        {failure ? <FailureBanner failure={failure} /> : null}
        {showInvite ? (
          <form
            onSubmit={submitInvite}
            className="grid gap-2 rounded-xs border border-line bg-inset/40 p-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <label className="field-label">
              Guest name
              <input name="name" className="input" required autoFocus />
            </label>
            <label className="field-label">
              Email
              <input name="email" type="email" className="input" />
            </label>
            <label className="field-label">
              Phone
              <input name="phone" type="tel" className="input" />
            </label>
            <label className="field-label">
              Dietary restrictions
              <input
                name="dietaryRestrictions"
                className="input"
                placeholder="Comma-separated"
              />
            </label>
            <label className="field-label">
              Allergens
              <input
                name="allergenRestrictions"
                className="input"
                placeholder="Comma-separated"
              />
            </label>
            <label className="field-label">
              Accessibility needs
              <input
                name="accessibilityNeeds"
                className="input"
                placeholder="Comma-separated"
              />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-[12px] text-ink-2">
              <input name="specialMealRequired" type="checkbox" /> Special meal
              required
            </label>
            <button
              className="btn btn-primary self-end"
              disabled={busy === "invite"}
            >
              {busy === "invite" ? "Inviting…" : "Invite guest"}
            </button>
          </form>
        ) : null}

        {eventGuests === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : guests.length === 0 ? (
          <EmptyState
            title="No guests invited"
            hint="Invite the first guest to begin attendance planning."
          />
        ) : (
          <div className="divide-y divide-line rounded-xs border border-line">
            {guests.map((guest) => {
              const version =
                typeof guest.version === "number" ? guest.version : undefined;
              const isBusy = busy?.endsWith(guest._id) ?? false;
              const guestAction = action?.guestId === guest._id ? action : null;
              return (
                <article key={guest._id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{guest.name}</h3>
                        <StatusChip status={guest.rsvpStatus} />
                        {guest.checkedInAt != null ? (
                          <span className="chip border-ok/30 bg-ok-soft text-ok">
                            Checked in
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11.5px] text-ink-3">
                        {guest.email ?? guest.phone ?? "No contact recorded"}
                        {guest.tableAssignment
                          ? ` · Table ${guest.tableAssignment}`
                          : ""}
                      </p>
                      {guest.dietaryRestrictions?.length ||
                      guest.allergenRestrictions?.length ||
                      guest.accessibilityNeeds?.length ? (
                        <p className="mt-1 text-[11.5px] text-ink-2">
                          {[
                            ...(guest.dietaryRestrictions ?? []),
                            ...(guest.allergenRestrictions ?? []),
                            ...(guest.accessibilityNeeds ?? []),
                          ].join(" · ")}
                        </p>
                      ) : null}
                      {guest.checkedInAt != null ? (
                        <p className="mt-1 font-mono text-[10.5px] text-ink-3">
                          {formatDate(guest.checkedInAt)}{" "}
                          {formatTime(guest.checkedInAt)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={!eventGuestPolicy.canConfirm(guest) || isBusy}
                        onClick={() =>
                          void run(`confirm-${guest._id}`, () =>
                            confirm({ docId: guest._id, version }),
                          )
                        }
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={!eventGuestPolicy.canDecline(guest) || isBusy}
                        onClick={() =>
                          setAction({ kind: "decline", guestId: guest._id })
                        }
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={!eventGuestPolicy.canCheckIn(guest) || isBusy}
                        onClick={() =>
                          void run(`checkin-${guest._id}`, () =>
                            checkIn({ docId: guest._id, version }),
                          )
                        }
                      >
                        Check in
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={
                          !eventGuestPolicy.canAssignTable(guest) || isBusy
                        }
                        onClick={() =>
                          setAction({ kind: "table", guestId: guest._id })
                        }
                      >
                        Assign table
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={
                          !eventGuestPolicy.canWithdraw(guest) || isBusy
                        }
                        onClick={() =>
                          setAction({ kind: "withdraw", guestId: guest._id })
                        }
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                  {guestAction ? (
                    <form
                      className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const value = String(
                          new FormData(event.currentTarget).get("value") ?? "",
                        ).trim();
                        if (guestAction.kind !== "decline" && !value) return;
                        if (guestAction.kind === "decline")
                          void run(`decline-${guest._id}`, () =>
                            decline({
                              docId: guest._id,
                              reason: value || undefined,
                              version,
                            }),
                          );
                        if (guestAction.kind === "table")
                          void run(`table-${guest._id}`, () =>
                            assignTable({
                              docId: guest._id,
                              tableAssignment: value,
                              version,
                            }),
                          );
                        if (guestAction.kind === "withdraw")
                          void run(`withdraw-${guest._id}`, () =>
                            withdraw({
                              docId: guest._id,
                              reason: value,
                              version,
                            }),
                          );
                      }}
                    >
                      <label className="field-label min-w-64 flex-1">
                        {guestAction.kind === "table"
                          ? "Table assignment"
                          : `${guestAction.kind === "decline" ? "Decline" : "Withdrawal"} reason${guestAction.kind === "decline" ? " (optional)" : ""}`}
                        <input
                          name="value"
                          className="input"
                          required={guestAction.kind !== "decline"}
                          autoFocus
                        />
                      </label>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={isBusy}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setAction(null)}
                      >
                        Dismiss
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}
