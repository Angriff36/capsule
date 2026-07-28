import { useAction, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { ErrorState, Section } from "../../ui/primitives";

function formatWhen(value: number | null | undefined): string {
  return value == null
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value);
}

export function WebhooksSection({ canManage }: { canManage: boolean }) {
  const catalog = useQuery(api.webhookIntegrations.getCatalog, {});
  const endpoints = useQuery(api.webhookIntegrations.listEndpoints, {});
  const deliveries = useQuery(api.webhookIntegrations.listDeliveries, {
    limit: 12,
  });
  const registerEndpoint = useAction(api.webhookIntegrations.registerEndpoint);
  const removeEndpoint = useAction(api.webhookIntegrations.removeEndpoint);
  const sendTest = useAction(api.webhookIntegrations.sendTest);

  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function toggleEvent(type: string) {
    setSelected((current) =>
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canManage) return;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Provide a webhook URL.");
      return;
    }
    if (selected.length === 0) {
      setError("Select at least one event to subscribe to.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await registerEndpoint({
        url: trimmedUrl,
        label: label.trim(),
        events: selected,
        ...(secret.trim() ? { secret: secret.trim() } : {}),
      });
      setNotice(
        `Endpoint registered. It will receive future ${selected.length === 1 ? "event" : "events"} within a minute.`,
      );
      setUrl("");
      setLabel("");
      setSecret("");
      setSelected([]);
      void result;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not register endpoint.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(endpointId: string) {
    if (busy || !canManage) return;
    setPendingId(endpointId);
    setError(null);
    setNotice(null);
    try {
      await removeEndpoint({ endpointId });
      setNotice("Endpoint removed.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove endpoint.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function test(endpointId: string) {
    if (busy || !canManage) return;
    setPendingId(endpointId);
    setError(null);
    setNotice(null);
    try {
      const result = await sendTest({ endpointId });
      setNotice(`Test delivered (HTTP ${result.httpStatus}).`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Test delivery failed.",
      );
    } finally {
      setPendingId(null);
    }
  }

  const catalogItems = catalog ?? [];

  return (
    <Section title="Outbound webhooks">
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <div>
          <p className="max-w-2xl text-[13px] leading-relaxed text-ink-2">
            Send a structured JSON payload to an external HTTP endpoint when a
            subscribed event happens — connect Zapier, Make, or a custom system
            without a separate API. Payloads are signed with
            <span className="font-mono"> X-Capsule-Signature</span>{" "}
            (HMAC-SHA256) when you provide a secret.
          </p>

          {error ? (
            <div className="mt-4">
              <ErrorState title="Webhook not saved" detail={error} />
            </div>
          ) : null}
          {notice ? (
            <p
              className="card mt-4 border-ok/30 bg-ok-soft px-4 py-3 text-[13px] text-ok"
              role="status"
            >
              {notice}
            </p>
          ) : null}

          <form
            className="supply-form mt-4 border-0 shadow-none"
            onSubmit={submit}
          >
            <label>
              Label
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Zapier — new booking"
                maxLength={120}
                disabled={!canManage || busy}
              />
            </label>
            <label>
              Endpoint URL
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://hooks.zapier.com/hooks/catch/…"
                required
                disabled={!canManage || busy}
              />
            </label>
            <fieldset className="mt-1">
              <legend className="mb-1 text-[12px] font-medium text-ink-2">
                Events to send
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalogItems.map((entry) => {
                  const checked = selected.includes(entry.type);
                  return (
                    <label
                      key={entry.type}
                      className={`flex cursor-pointer items-start gap-2 rounded-sm border border-line bg-inset px-3 py-2 text-[12px] ${
                        checked ? "border-ok/50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEvent(entry.type)}
                        disabled={!canManage || busy}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium text-ink">
                          {entry.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-3">
                          {entry.description}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] text-ink-3">
                          {entry.type}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label>
              Signing secret (optional)
              <input
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="Leave blank to skip signing"
                disabled={!canManage || busy}
                autoComplete="off"
              />
              <span className="mt-1 block text-[11px] font-normal text-ink-3">
                Stored encrypted. Verify the signature on the receiver to
                confirm authenticity.
              </span>
            </label>
            <div className="supply-row-actions">
              <button className="btn btn-primary" disabled={!canManage || busy}>
                {busy ? "Saving…" : "Register endpoint"}
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <div className="rounded-sm border border-line bg-inset p-4">
            <p className="eyebrow">Registered endpoints</p>
            {endpoints === undefined ? (
              <p className="mt-2 text-[12px] text-ink-3">Loading…</p>
            ) : endpoints.length === 0 ? (
              <p className="mt-2 text-[12px] text-ink-3">
                No endpoints yet. Registered endpoints appear here.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {endpoints.map((endpoint) => (
                  <li
                    key={endpoint.endpointId}
                    className="rounded-sm border border-line bg-panel p-3 text-[12px]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {endpoint.label}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
                          {endpoint.url}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={
                            !canManage || pendingId === endpoint.endpointId
                          }
                          onClick={() => void test(endpoint.endpointId)}
                        >
                          Send test
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={
                            !canManage || pendingId === endpoint.endpointId
                          }
                          onClick={() => void remove(endpoint.endpointId)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {endpoint.eventLabels.map((name) => (
                        <span
                          key={name}
                          className="chip border-line-2 bg-inset text-ink-2"
                        >
                          {name}
                        </span>
                      ))}
                      {endpoint.hasSecret ? (
                        <span className="chip border-ok/30 bg-ok-soft text-ok">
                          Signed
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[11px] text-ink-3">
                      Registered {formatWhen(endpoint.registeredAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-sm border border-line bg-inset p-4">
            <p className="eyebrow">Recent deliveries</p>
            {deliveries === undefined ? (
              <p className="mt-2 text-[12px] text-ink-3">Loading…</p>
            ) : deliveries.length === 0 ? (
              <p className="mt-2 text-[12px] text-ink-3">
                No deliveries yet. Deliveries appear here once an event fires.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-[12px]">
                {deliveries.map((delivery) => (
                  <li key={delivery.deliveryId} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[11px] text-ink-3">
                        {delivery.eventType}
                      </span>
                      <span
                        className={
                          delivery.status === "succeeded"
                            ? "font-semibold text-ok"
                            : "font-semibold text-danger"
                        }
                      >
                        {delivery.status === "succeeded"
                          ? "Delivered"
                          : `Failed (attempt ${delivery.attempt})`}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3 text-ink-3">
                      <span className="truncate">{delivery.endpointLabel}</span>
                      <span>{formatWhen(delivery.deliveredAt)}</span>
                    </div>
                    {delivery.error ? (
                      <p className="mt-0.5 text-[11px] text-danger">
                        {delivery.error}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
