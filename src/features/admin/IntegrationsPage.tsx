import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { ErrorState, PageHeader, Section } from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";
import { WebhooksSection } from "./WebhooksSection";

function formatWhen(value: number | null | undefined): string {
  return value == null
    ? "Not yet"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value);
}

export function IntegrationsPage() {
  const status = useQuery(api.googleCalendar.getConnectionStatus, {});
  const beginConnection = useAction(api.googleCalendar.beginConnection);
  const completeConnection = useAction(api.googleCalendar.completeConnection);
  const disconnect = useAction(api.googleCalendar.disconnect);
  const syncNow = useAction(api.googleCalendar.syncNow);
  const [searchParams, setSearchParams] = useSearchParams();
  const callbackHandled = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (callbackHandled.current) return;
    const providerError = searchParams.get("error");
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!providerError && !(code && state)) return;
    callbackHandled.current = true;
    setSearchParams({}, { replace: true });
    if (providerError) {
      setError(
        providerError === "access_denied"
          ? "Google Calendar access was not granted. Nothing changed."
          : `Google could not complete the connection (${providerError}).`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    void completeConnection({ code: code!, state: state! })
      .then(() =>
        setNotice(
          "Google Calendar connected. Confirmed events are syncing now.",
        ),
      )
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Google Calendar could not be connected.",
        ),
      )
      .finally(() => setBusy(false));
  }, [completeConnection, searchParams, setSearchParams]);

  if (status === undefined) {
    return (
      <QueryLoadState
        loadingTooLong={false}
        title="Loading integrations"
        detail="Checking the organization's calendar connection."
      />
    );
  }
  const connection = status;

  async function connect() {
    if (busy || !connection.canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await beginConnection({});
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Google Calendar could not be opened.",
      );
      setBusy(false);
    }
  }

  async function removeConnection() {
    if (busy || !connection.canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await disconnect({});
      setNotice(
        "Google Calendar disconnected. Existing calendar entries were left in place.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Google Calendar could not be disconnected.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    if (busy || !connection.canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await syncNow({});
      setNotice(
        `Calendar sync finished: ${result.createdOrUpdated} saved, ${result.deleted} removed, ${result.skipped} already current.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Calendar sync failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="Integrations"
        lead="Connect the services that keep event operations moving without duplicate entry."
      />
      <AdminWorkspaceNav />

      {!connection.canManage ? (
        <div className="card border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          Only an organization manager can change shared integrations.
        </div>
      ) : null}
      {error ? (
        <ErrorState title="Google Calendar needs attention" detail={error} />
      ) : null}
      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-[13px] text-ok"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <Section title="Google Calendar">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
          <div>
            <p className="max-w-2xl text-[13px] leading-relaxed text-ink-2">
              Approved events are added to the connected primary calendar with
              their name, date and time, venue, and expected headcount.
              Reschedules and planning changes update the same entry;
              cancellations remove it.
            </p>

            {!connection.providerConfigured ? (
              <div className="mt-4 rounded-sm border border-warn/30 bg-warn-soft px-4 py-3 text-[12px] leading-relaxed text-warn">
                Add the Google OAuth client ID, client secret, and authorized
                redirect URI to the Convex environment before connecting.
                {connection.redirectUri ? (
                  <span className="mt-1 block font-mono">
                    {connection.redirectUri}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {connection.connected ? (
                <>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy || !connection.canManage}
                    onClick={() => void runSync()}
                  >
                    {busy ? "Working…" : "Sync now"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy || !connection.canManage}
                    onClick={() => void removeConnection()}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={
                    busy ||
                    !connection.canManage ||
                    !connection.providerConfigured
                  }
                  onClick={() => void connect()}
                >
                  {busy ? "Connecting…" : "Connect Google Calendar"}
                </button>
              )}
            </div>
          </div>

          <dl className="grid content-start gap-3 rounded-sm border border-line bg-surface-2 p-4 text-[12px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Connection</dt>
              <dd className="font-semibold text-ink">
                {connection.connected ? "Connected" : "Not connected"}
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
              <dt className="text-ink-3">Last sync</dt>
              <dd className="text-right font-semibold text-ink">
                {formatWhen(connection.lastSync?.at)}
              </dd>
            </div>
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

      <WebhooksSection canManage={connection.canManage} />
    </div>
  );
}
