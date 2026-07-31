import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { ErrorState, PageHeader, Section } from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";
import { StripeConnectSection } from "./StripeConnectSection";
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

  const qboStatus = useQuery(api.qboSync.getConnectionStatus, {});
  const qboBeginConnection = useAction(api.qboSync.beginConnection);
  const qboCompleteConnection = useAction(api.qboSync.completeConnection);
  const qboDisconnect = useAction(api.qboSync.disconnect);
  const qboSyncNow = useAction(api.qboSync.syncNow);

  const smsStatus = useQuery(api.smsAlerts.getStatus, {});
  const enableSmsAlerts = useAction(api.smsAlerts.enableAlerts);
  const disableSmsAlerts = useAction(api.smsAlerts.disableAlerts);

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
    const realmId = searchParams.get("realmId");
    if (!providerError && !(code && state)) return;
    callbackHandled.current = true;
    setSearchParams({}, { replace: true });
    if (providerError) {
      setError(
        providerError === "access_denied"
          ? "Access was not granted. Nothing changed."
          : `The provider could not complete the connection (${providerError}).`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    // QuickBooks returns realmId on its callback; Google Calendar does not.
    const complete = realmId
      ? qboCompleteConnection({ code: code!, state: state!, realmId }).then(
          () =>
            setNotice(
              "QuickBooks connected. Confirmed invoices and payments are syncing now.",
            ),
        )
      : completeConnection({ code: code!, state: state! }).then(() =>
          setNotice(
            "Google Calendar connected. Confirmed events are syncing now.",
          ),
        );
    void complete
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "The connection failed.",
        ),
      )
      .finally(() => setBusy(false));
  }, [
    completeConnection,
    qboCompleteConnection,
    searchParams,
    setSearchParams,
  ]);

  async function toggleSmsAlerts(enable: boolean) {
    if (busy || !smsStatus?.canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (enable) {
        await enableSmsAlerts({});
        setNotice(
          "SMS alerts enabled. Opted-in staff with a phone on file will be texted on high-urgency triggers.",
        );
      } else {
        await disableSmsAlerts({});
        setNotice("SMS alerts paused. No further texts will be sent.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The SMS alert setting could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (
    status === undefined ||
    qboStatus === undefined ||
    smsStatus === undefined
  ) {
    return (
      <QueryLoadState
        loadingTooLong={false}
        title="Loading integrations"
        detail="Checking the organization's connected services."
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

  async function connectQbo() {
    if (busy || !qboStatus!.canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await qboBeginConnection({});
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "QuickBooks could not be opened.",
      );
      setBusy(false);
    }
  }

  async function removeQbo() {
    if (busy || !qboStatus!.canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await qboDisconnect({});
      setNotice(
        "QuickBooks disconnected. Records already synced were left in place.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "QuickBooks could not be disconnected.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runQboSync() {
    if (busy || !qboStatus!.canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await qboSyncNow({});
      setNotice(
        `QuickBooks sync finished: ${result.invoicesSynced} invoices, ${result.paymentsSynced} payments, ${result.skipped} already current, ${result.failed} failed.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "QuickBooks sync failed.",
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
        <div className="card border-warn/30 bg-warn-soft px-4 py-3 text-base text-warn">
          Only an organization manager can change shared integrations.
        </div>
      ) : null}
      {error ? (
        <ErrorState title="An integration needs attention" detail={error} />
      ) : null}
      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-base text-ok"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <Section title="Google Calendar">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
          <div>
            <p className="max-w-2xl text-base leading-relaxed text-ink-2">
              Approved events are added to the connected primary calendar with
              their name, date and time, venue, and expected headcount.
              Reschedules and planning changes update the same entry;
              cancellations remove it.
            </p>

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

          <dl className="grid content-start gap-3 rounded-sm border border-line bg-inset p-4 text-sm">
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

      <Section title="QuickBooks Online">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
          <div>
            <p className="max-w-2xl text-base leading-relaxed text-ink-2">
              Confirmed invoices and received payments are pushed to your
              QuickBooks Online accounts receivable. Clients are matched to
              QuickBooks customers by name on first sync, creating the customer
              when no match exists.
            </p>

            {!qboStatus.providerConfigured ? (
              <div className="mt-4 rounded-sm border border-warn/30 bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
                QuickBooks isn't set up on the server yet. Ask your technician
                to add the QuickBooks OAuth client ID, client secret, and
                authorized redirect URI, then connect.
                {qboStatus.redirectUri ? (
                  <span className="mt-1 block font-mono">
                    {qboStatus.redirectUri}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {qboStatus.connected ? (
                <>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy || !qboStatus.canManage}
                    onClick={() => void runQboSync()}
                  >
                    {busy ? "Working…" : "Sync now"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy || !qboStatus.canManage}
                    onClick={() => void removeQbo()}
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
                    !qboStatus.canManage ||
                    !qboStatus.providerConfigured
                  }
                  onClick={() => void connectQbo()}
                >
                  {busy ? "Connecting…" : "Connect QuickBooks Online"}
                </button>
              )}
            </div>
          </div>

          <dl className="grid content-start gap-3 rounded-sm border border-line bg-inset p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Connection</dt>
              <dd className="font-semibold text-ink">
                {qboStatus.connected ? "Connected" : "Not connected"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Company</dt>
              <dd className="font-semibold text-ink">
                {qboStatus.connected ? (qboStatus.realmId ?? "—") : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Connected</dt>
              <dd className="text-right font-semibold text-ink">
                {formatWhen(qboStatus.connectedAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Last sync</dt>
              <dd className="text-right font-semibold text-ink">
                {formatWhen(qboStatus.lastSync?.at)}
              </dd>
            </div>
            {qboStatus.lastSync ? (
              <div className="border-t border-line pt-3 text-ink-2">
                {qboStatus.lastSync.invoicesSynced} invoices ·{" "}
                {qboStatus.lastSync.paymentsSynced} payments ·{" "}
                {qboStatus.lastSync.failed} failed
                {qboStatus.lastSync.error ? (
                  <span className="mt-2 block text-warn">
                    {qboStatus.lastSync.error}
                  </span>
                ) : null}
              </div>
            ) : null}
          </dl>
        </div>
      </Section>

      <Section title="SMS alerts (Twilio)">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
          <div>
            <p className="max-w-2xl text-base leading-relaxed text-ink-2">
              Opted-in staff receive a text message on three high-urgency
              triggers: a delivery is dispatched, an event starts in about two
              hours, and a critical allergen incident is reported. Each person
              opts in from Staff → Roster, and only staff with a phone on file
              are texted.
            </p>

            {!smsStatus.providerConfigured ? (
              <div className="mt-4 rounded-sm border border-warn/30 bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
                Text messaging isn't set up on the server yet. Ask your
                technician to add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
                TWILIO_FROM_NUMBER, then enable SMS alerts.
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {smsStatus.enabled ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy || !smsStatus.canManage}
                  onClick={() => void toggleSmsAlerts(false)}
                >
                  {busy ? "Working…" : "Pause SMS alerts"}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={
                    busy ||
                    !smsStatus.canManage ||
                    !smsStatus.providerConfigured
                  }
                  onClick={() => void toggleSmsAlerts(true)}
                >
                  {busy ? "Enabling…" : "Enable SMS alerts"}
                </button>
              )}
            </div>
          </div>

          <dl className="grid content-start gap-3 rounded-sm border border-line bg-inset p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Provider</dt>
              <dd className="font-semibold text-ink">
                {smsStatus.providerConfigured ? "Twilio configured" : "Not set"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Status</dt>
              <dd className="font-semibold text-ink">
                {smsStatus.enabled ? "Enabled" : "Paused"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-3">Last scan</dt>
              <dd className="text-right font-semibold text-ink">
                {formatWhen(smsStatus.lastScan?.at)}
              </dd>
            </div>
            {smsStatus.lastScan ? (
              <div className="border-t border-line pt-3 text-ink-2">
                {smsStatus.lastScan.sent} sent · {smsStatus.lastScan.failed}{" "}
                failed
                {smsStatus.lastScan.error ? (
                  <span className="mt-2 block text-warn">
                    {smsStatus.lastScan.error}
                  </span>
                ) : null}
              </div>
            ) : null}
          </dl>
        </div>
      </Section>

      <StripeConnectSection />

      <WebhooksSection canManage={connection.canManage} />
    </div>
  );
}
