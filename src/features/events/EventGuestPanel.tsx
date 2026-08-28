import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";

import {
  useEventGuestAssignTable,
  useEventGuestCheckIn,
  useEventGuestRsvpConfirm,
  useEventGuestRsvpDecline,
  useEventGuestWithdraw,
  useCreateEventGuest,
} from "../../lib/manifest-convex-react";
import { EmptyState, Skeleton } from "../../ui/primitives";
import { PlusIcon, SearchIcon } from "../../ui/icons";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import {
  assessGuestListCoverage,
  GuestListCoverageNotice,
} from "./GuestListCoverageNotice";
import { EventGuestInviteForm } from "./EventGuestInviteForm";
import { EventGuestRow, type GuestRowAction } from "./EventGuestRow";
import { EventGuestSidebar } from "./EventGuestSidebar";
import {
  GUEST_FILTERS,
  matchesGuestFilter,
  summarizeEventGuests,
  type GuestFilterKey,
} from "./eventGuestSummary";

type GuestAction = {
  kind: GuestRowAction;
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

function Tile({
  label,
  value,
  note,
  tone = "ink",
}: {
  label: string;
  value: number;
  note: string;
  tone?: "ink" | "ok" | "warn" | "info";
}) {
  const valueTone =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "info"
          ? "text-info"
          : "text-ink";
  return (
    <div className="card px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 font-mono text-3xl font-semibold ${valueTone}`}>
        {value}
      </p>
      <p className="mt-0.5 text-sm text-ink-3">{note}</p>
    </div>
  );
}

export function EventGuestPanel({
  eventId,
  expectedHeadcount,
}: {
  eventId: Id<"events">;
  expectedHeadcount?: number | null;
}) {
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
  const [filter, setFilter] = useState<GuestFilterKey>("all");
  const [search, setSearch] = useState("");

  const guests = useMemo(
    () =>
      (eventGuests ?? [])
        .filter((guest) => guest.invitedAt != null && guest.deletedAt == null)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [eventGuests],
  );
  const summary = useMemo(() => summarizeEventGuests(guests), [guests]);
  const visible = useMemo(
    () => guests.filter((guest) => matchesGuestFilter(guest, filter, search)),
    [filter, guests, search],
  );
  const headcount = Number(expectedHeadcount) || 0;

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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        {failure ? <FailureBanner failure={failure} /> : null}
        {eventGuests !== undefined ? (
          <GuestListCoverageNotice
            coverage={assessGuestListCoverage(guests.length, expectedHeadcount)}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile
            label="Total invited"
            value={summary.total}
            note={headcount > 0 ? `of ${headcount} headcount` : "recorded"}
          />
          <Tile
            label="Confirmed"
            value={summary.confirmed}
            tone="ok"
            note={
              summary.total > 0
                ? `${summary.acceptanceRate}% acceptance`
                : "no responses yet"
            }
          />
          <Tile
            label="Pending"
            value={summary.pending}
            tone="warn"
            note="awaiting response"
          />
          <Tile
            label="Checked in"
            value={summary.checkedIn}
            tone="info"
            note="day-of arrival"
          />
        </div>

        <div className="card flex flex-wrap items-center gap-2 p-3">
          {GUEST_FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={
                filter === option.key
                  ? "btn btn-secondary btn-sm"
                  : "btn btn-ghost btn-sm"
              }
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label className="relative flex items-center">
              <SearchIcon
                width={14}
                height={14}
                className="pointer-events-none absolute left-2.5 text-ink-3"
              />
              <span className="sr-only">Search guests</span>
              <input
                className="input w-48 pl-8"
                placeholder="Search guests…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowInvite((value) => !value)}
            >
              <PlusIcon width={13} height={13} />
              {showInvite ? "Dismiss" : "Invite guest"}
            </button>
          </div>
        </div>

        {showInvite ? (
          <EventGuestInviteForm
            busy={busy === "invite"}
            onSubmit={submitInvite}
            onDismiss={() => setShowInvite(false)}
          />
        ) : null}

        {eventGuests === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : guests.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No guests invited"
              hint="Invite the first guest to begin attendance planning."
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No guests match this view"
              hint="Clear the search or choose another filter."
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Guest</th>
                  <th className="th">Contact</th>
                  <th className="th">RSVP</th>
                  <th className="th">Check-in</th>
                  <th className="th">Dietary</th>
                  <th className="th">Allergens</th>
                  <th className="th">Special meal</th>
                  <th className="th">Table</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {visible.map((guest) => {
                  const version =
                    typeof guest.version === "number"
                      ? guest.version
                      : undefined;
                  return (
                    <EventGuestRow
                      key={guest._id}
                      guest={guest}
                      isBusy={busy?.endsWith(guest._id) ?? false}
                      openAction={
                        action != null && action.guestId === guest._id
                          ? action.kind
                          : null
                      }
                      onConfirm={() =>
                        void run(`confirm-${guest._id}`, () =>
                          confirm({ docId: guest._id, version }),
                        )
                      }
                      onCheckIn={() =>
                        void run(`checkin-${guest._id}`, () =>
                          checkIn({ docId: guest._id, version }),
                        )
                      }
                      onOpenAction={(kind) =>
                        setAction({ kind, guestId: guest._id })
                      }
                      onCloseAction={() => setAction(null)}
                      onSubmitAction={(kind, value) => {
                        if (kind === "decline")
                          void run(`decline-${guest._id}`, () =>
                            decline({
                              docId: guest._id,
                              reason: value || undefined,
                              version,
                            }),
                          );
                        if (kind === "table")
                          void run(`table-${guest._id}`, () =>
                            assignTable({
                              docId: guest._id,
                              tableAssignment: value,
                              version,
                            }),
                          );
                        if (kind === "withdraw")
                          void run(`withdraw-${guest._id}`, () =>
                            withdraw({
                              docId: guest._id,
                              reason: value,
                              version,
                            }),
                          );
                      }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {guests.length > 0 ? (
        <EventGuestSidebar
          summary={summary}
          expectedHeadcount={expectedHeadcount}
          briefingPath={`/events/${eventId}/allergen-briefing`}
        />
      ) : null}
    </div>
  );
}
