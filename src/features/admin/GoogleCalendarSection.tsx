import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api, type Id } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { publicErrorMessage } from "../../lib/publicErrorMessage";
import { ErrorState, Section } from "../../ui/primitives";
import { useActionFailure, useActionNotice } from "../../ui/action-result";

type CalendarConnection = FunctionReturnType<
  typeof api.googleCalendar.getConnectionStatus
>;
type CalendarHealth = FunctionReturnType<
  typeof api.googleCalendarHealth.connectionHealth
>;

const STATE_LABEL: Record<CalendarHealth["state"], string> = {
  not_connected: "Not connected",
  waiting_first_sync: "Connected, waiting for its first sync",
  in_step: "Connected and up to date",
  needs_attention: "Connected, some events need a look",
  needs_reconnect: "Google stopped accepting Capsule - connect again",
};

function formatWhen(value: number | null | undefined): string {
  return value == null
    ? "Not yet"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value);
}

/**
 * Google Calendar on the Integrations page (PL-CONNECTIONS): connect with the
 * "past events" choice, what Capsule owns on the calendar, the last GOOD sync
 * apart from the last try, what is waiting, each event that did not go with
 * its own "Try again", and "Connect again" when Google withdrew access.
 */
export function GoogleCalendarSection({
  connection,
}: {
  readonly connection: CalendarConnection;
}) {
  const health = useQuery(api.googleCalendarHealth.connectionHealth, {});
  const beginConnection = useAction(api.googleCalendar.beginConnection);
  const disconnect = useAction(api.googleCalendar.disconnect);
  const syncNow = useAction(api.googleCalendar.syncNow);
  const retryEvent = useAction(api.googleCalendar.retryEvent);
  const [busy, setBusy] = useState(false);
  const [includePast, setIncludePast] = useState(false);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  const canManage = connection.canManage;

  async function run(work: () => Promise<void>, fallback: string) {
    if (busy || !canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (cause) {
      setError(publicErrorMessage(cause, fallback));
    } finally {
      setBusy(false);
    }
  }

  const connect = () =>
    run(async () => {
      const result = await beginConnection({ includePast });
      window.location.assign(result.authorizationUrl);
    }, "Google Calendar could not be opened.");

  const removeConnection = () =>
    run(async () => {
      await disconnect({});
      setNotice(
        "Google Calendar disconnected. Existing calendar entries were left in place.",
      );
    }, "Google Calendar could not be disconnected.");

  const runSync = () =>
    run(async () => {
      const result = await syncNow({});
      setNotice(
        `Calendar sync finished: ${result.createdOrUpdated} saved, ${result.deleted} removed, ${result.skipped} already current.`,
      );
    }, "Calendar sync failed.");

  const retry = (eventId: string, title: string) =>
    run(async () => {
      const result = await retryEvent({ eventId: eventId as Id<"events"> });
      if (result.status === "failed") {
        setError(
          `${title} still did not reach Google Calendar: ${result.error ?? "no reason given"}. Capsule keeps trying by itself.`,
        );
      } else {
        setNotice(`${title} is on Google Calendar now.`);
      }
    }, "That event could not be sent again.");

  const needsReconnect = health?.state === "needs_reconnect";

  return (
    <Section title="Google Calendar">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
        <div>
          <p className="max-w-2xl text-base leading-relaxed text-ink-2">
            Approved events are added to the connected primary calendar with
            their name, date and time, venue, and expected headcount.
            Reschedules and planning changes update the same entry;
            cancellations remove it.
          </p>

          {error ? (
            <div className="mt-4">
              <ErrorState title="Google Calendar" detail={error} />
            </div>
          ) : null}
          {notice ? (
            <p className="mt-4 text-sm text-ok" role="status">
              {notice}
            </p>
          ) : null}

          {!connection.providerConfigured ? (
            <div className="mt-4 rounded-sm border border-warn/30 bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
              Google Calendar isn't set up on the server yet. Ask your
              technician to add the Google OAuth client ID, client secret, and
              authorized redirect URI, then connect.
              {connection.redirectUri ? (
                <span className="mt-1 block font-mono">
                  {connection.redirectUri}
                </span>
              ) : null}
            </div>
          ) : null}

          {!connection.connected && connection.disconnectedAt != null ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-2">
              Disconnected {formatWhen(connection.disconnectedAt)}. Capsule
              stopped updating Google Calendar
              {connection.entriesLeftOnCalendar > 0
                ? `; the ${connection.entriesLeftOnCalendar} event${
                    connection.entriesLeftOnCalendar === 1 ? "" : "s"
                  } already there stay as last sent`
                : ""}
              . Connect again to update them; Capsule reuses the same calendar
              entries, so nothing is added twice.
            </p>
          ) : null}

          {connection.connected && health?.basis ? (
            <p
              className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-2"
              data-testid="calendar-basis"
            >
              {health.basis.includePast
                ? "Sends past and upcoming events."
                : `Sends events that end on or after ${formatDate(health.basis.startsFrom)}.`}{" "}
              Capsule owns the {health.basis.fieldsOwnedByCapsule.join(", ")} on
              these entries; a change made in Google Calendar is replaced by
              Capsule's next update.
            </p>
          ) : null}

          {needsReconnect ? (
            <p className="mt-4 max-w-2xl rounded-sm border border-warn/30 bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
              Google no longer accepts Capsule's access (the permission was
              removed or ran out). Nothing is being sent. Connect again; Capsule
              reuses the same calendar entries.
            </p>
          ) : null}

          {!connection.connected ? (
            <label className="mt-4 flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={includePast}
                disabled={busy || !canManage}
                onChange={(event) => setIncludePast(event.target.checked)}
              />
              Also add past events (otherwise only events from today on)
            </label>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {connection.connected ? (
              <>
                {needsReconnect ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={
                      busy || !canManage || !connection.providerConfigured
                    }
                    onClick={() => void connect()}
                  >
                    {busy ? "Connecting…" : "Connect again"}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy || !canManage}
                    onClick={() => void runSync()}
                  >
                    {busy ? "Working…" : "Sync now"}
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy || !canManage}
                  onClick={() => void removeConnection()}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !canManage || !connection.providerConfigured}
                onClick={() => void connect()}
              >
                {busy ? "Connecting…" : "Connect Google Calendar"}
              </button>
            )}
          </div>

          {health && health.failed.length > 0 ? (
            <div className="mt-5" data-testid="calendar-failed-events">
              <h3 className="text-sm font-semibold text-ink">
                Not on the calendar yet
              </h3>
              <ul className="mt-2 divide-y divide-line rounded-sm border border-line">
                {health.failed.map((item) => (
                  <li
                    key={item.eventId}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-semibold text-ink">
                        {item.title}
                      </span>{" "}
                      <span className="text-ink-3">
                        {formatDate(item.startsAt)}
                      </span>
                      <span className="block text-warn">{item.error}</span>
                    </span>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={busy || !canManage || needsReconnect}
                      onClick={() => void retry(item.eventId, item.title)}
                    >
                      Try again
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <dl className="grid content-start gap-3 rounded-sm border border-line bg-inset p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-3">Connection</dt>
            <dd className="text-right font-semibold text-ink">
              {connection.connected
                ? health
                  ? STATE_LABEL[health.state]
                  : "Connected"
                : "Not connected"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-3">Calendar</dt>
            <dd className="font-semibold text-ink">
              {connection.connected ? "Primary calendar" : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-3">Connected</dt>
            <dd className="text-right font-semibold text-ink">
              {formatWhen(connection.connectedAt)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-3">Last good sync</dt>
            <dd className="text-right font-semibold text-ink">
              {formatWhen(health?.lastSuccessfulSyncAt)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-3">Last try</dt>
            <dd className="text-right font-semibold text-ink">
              {formatWhen(connection.lastSync?.at)}
            </dd>
          </div>
          {connection.connected && health ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Waiting to send</dt>
              <dd className="text-right font-semibold text-ink">
                {health.waitingCount} event
                {health.waitingCount === 1 ? "" : "s"}
              </dd>
            </div>
          ) : null}
          {connection.lastSync ? (
            <div className="border-t border-line pt-3 text-ink-2">
              {connection.lastSync.createdOrUpdated} saved ·{" "}
              {connection.lastSync.deleted} removed ·{" "}
              {connection.lastSync.failed} failed
              {connection.lastSync.error ? (
                <span className="mt-2 block text-warn">
                  {connection.lastSync.error}
                </span>
              ) : null}
            </div>
          ) : null}
        </dl>
      </div>
    </Section>
  );
}
