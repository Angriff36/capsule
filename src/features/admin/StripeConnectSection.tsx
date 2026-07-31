import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { publicErrorMessage } from "../../lib/publicErrorMessage";
import { ErrorState, Section, StatusChip } from "../../ui/primitives";

// Stripe Connect (issue #112) — a tenant's invoice payments settle to that
// tenant's own Stripe account, never to the platform. Standard connected
// account + direct charges, so the caterer owns disputes, payouts and fees.

interface ConnectionView {
  canManage: boolean;
  connectionId: string | null;
  status: string;
  externalAccountId: string | null;
  displayName: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  lastErrorMessage: string | null;
}

const DISCONNECTED: ConnectionView = {
  canManage: false,
  connectionId: null,
  status: "disconnected",
  externalAccountId: null,
  displayName: null,
  chargesEnabled: false,
  payoutsEnabled: false,
  lastErrorMessage: null,
};

function chipColor(view: ConnectionView): string {
  if (view.status === "error")
    return "border-danger/40 bg-danger/10 text-danger";
  if (view.status === "connected" && view.chargesEnabled) {
    return "border-ok/40 bg-ok/10 text-ok";
  }
  if (view.status === "connected" || view.status === "pending") {
    return "border-warn/40 bg-warn/10 text-warn";
  }
  return "border-line-2 bg-inset text-ink-2";
}

function chipLabel(view: ConnectionView): string {
  if (view.status === "connected") {
    return view.chargesEnabled ? "Accepting payments" : "Onboarding incomplete";
  }
  if (view.status === "pending") return "Onboarding started";
  if (view.status === "error") return "Error";
  if (view.status === "revoked") return "Disconnected";
  return "Not connected";
}

export function StripeConnectSection() {
  const getConnection = useAction(api.stripeConnect.getStripeConnection);
  const startOnboarding = useAction(api.stripeConnect.startStripeOnboarding);
  const refreshConnection = useAction(
    api.stripeConnect.refreshStripeConnection,
  );
  const disconnectStripe = useAction(api.stripeConnect.disconnectStripe);

  const [view, setView] = useState<ConnectionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const returnHandled = useRef(false);

  const load = useCallback(async () => {
    try {
      setView(await getConnection({}));
    } catch (cause) {
      // An unconfigured Stripe environment must not break the whole page.
      setView(DISCONNECTED);
      setError(publicErrorMessage(cause, "Stripe status is unavailable."));
    }
  }, [getConnection]);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back from Stripe-hosted onboarding: pull the real capabilities so
  // the operator sees whether the account can actually take money yet.
  useEffect(() => {
    if (returnHandled.current) return;
    const flag = searchParams.get("stripe_connect");
    if (flag !== "return" && flag !== "refresh") return;
    returnHandled.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("stripe_connect");
    setSearchParams(next, { replace: true });
    void (async () => {
      setBusy(true);
      try {
        setView(await refreshConnection({}));
        setNotice("Stripe account status updated.");
      } catch (cause) {
        setError(
          publicErrorMessage(cause, "Stripe status could not be refreshed."),
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [searchParams, setSearchParams, refreshConnection]);

  async function connect() {
    if (busy || !canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await startOnboarding({});
      window.location.assign(result.onboardingUrl);
    } catch (cause) {
      setError(
        publicErrorMessage(cause, "Stripe onboarding could not be started."),
      );
      setBusy(false);
    }
  }

  async function refresh() {
    if (busy || !canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setView(await refreshConnection({}));
      setNotice("Stripe account status updated.");
    } catch (cause) {
      setError(
        publicErrorMessage(cause, "Stripe status could not be refreshed."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await disconnectStripe({});
      await load();
      setNotice(
        "Stripe disconnected from Capsule. Your Stripe account itself is untouched.",
      );
    } catch (cause) {
      setError(publicErrorMessage(cause, "Stripe could not be disconnected."));
    } finally {
      setBusy(false);
    }
  }

  const current = view ?? DISCONNECTED;
  const canManage = current.canManage;
  const started =
    current.status === "connected" || current.status === "pending";

  return (
    <Section title="Stripe payments">
      <div className="grid gap-4 p-4">
        <p className="text-sm text-ink-2">
          Card and bank payments for your invoices. Money goes straight to your
          own Stripe account — Capsule never holds it.
        </p>

        {error ? <ErrorState title="Stripe" detail={error} /> : null}
        {notice ? (
          <p className="text-sm text-ok" role="status">
            {notice}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={current.status} color={chipColor(current)}>
            {chipLabel(current)}
          </StatusChip>
          {current.displayName ? (
            <span className="text-sm text-ink-2">{current.displayName}</span>
          ) : null}
          {current.externalAccountId ? (
            <code className="font-mono text-xs text-ink-3">
              {current.externalAccountId}
            </code>
          ) : null}
        </div>

        {current.status === "connected" && !current.chargesEnabled ? (
          <p className="text-sm text-warn">
            Stripe needs more details before this account can accept payments.
            Continue onboarding, then refresh.
          </p>
        ) : null}
        {current.status === "connected" &&
        current.chargesEnabled &&
        !current.payoutsEnabled ? (
          <p className="text-sm text-warn">
            Payments are enabled, but Stripe has not enabled payouts yet — add
            your bank details in Stripe to receive the money.
          </p>
        ) : null}
        {current.lastErrorMessage ? (
          <p className="text-sm text-danger">{current.lastErrorMessage}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !canManage}
            onClick={() => void connect()}
          >
            {busy
              ? "Working…"
              : started
                ? "Continue Stripe onboarding"
                : "Connect Stripe"}
          </button>
          {started ? (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy || !canManage}
              onClick={() => void refresh()}
            >
              Refresh status
            </button>
          ) : null}
          {current.connectionId ? (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy || !canManage}
              onClick={() => void remove()}
            >
              Disconnect
            </button>
          ) : null}
        </div>

        {!canManage ? (
          <p className="text-sm text-ink-3">
            Ask an admin to connect Stripe for this workspace.
          </p>
        ) : null}
      </div>
    </Section>
  );
}
