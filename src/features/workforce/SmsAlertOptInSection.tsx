import { useState } from "react";
import type { Doc } from "../../lib/api";
import { usePersonSetSmsAlerts } from "../../lib/manifest-convex-react";

/**
 * Manager-facing control for the high-urgency SMS alert opt-in stored on each
 * Person (Person.smsAlertsOptIn). Recipients only receive alerts once the tenant
 * enables SMS in Admin → Integrations AND they are opted in here with a phone on
 * file.
 */
export function SmsAlertOptInSection({ people }: { people: Doc<"people">[] }) {
  const setSmsAlerts = usePersonSetSmsAlerts();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roster = [...people].sort((a, b) =>
    `${a.givenName} ${a.familyName}`.localeCompare(
      `${b.givenName} ${b.familyName}`,
    ),
  );

  const toggle = async (person: Doc<"people">, optIn: boolean) => {
    if (busy) return;
    setBusy(person._id);
    setError(null);
    try {
      await setSmsAlerts({ docId: person._id, version: person.version, optIn });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The SMS opt-in could not be saved.",
      );
    } finally {
      setBusy(null);
    }
  };

  const optedInCount = roster.filter((p) => p.smsAlertsOptIn === true).length;

  return (
    <section className="working-ledger">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Alerts</p>
          <h2>High-urgency SMS opt-in</h2>
        </div>
        <span>{optedInCount} opted in</span>
      </div>
      <p className="mt-1 max-w-160 text-[13px] leading-relaxed text-ink-2">
        Opted-in staff receive a text for delivery dispatch, events starting in
        about two hours, and critical allergen incidents. Enable the Twilio
        provider in Admin → Integrations for messages to send.
      </p>
      {error ? (
        <div
          className="mt-3 rounded-sm border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn"
          role="status"
        >
          {error}
        </div>
      ) : null}
      {roster.length === 0 ? (
        <div className="document-empty">
          <p>No active people to configure.</p>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-line-2">
          {roster.map((person) => {
            const optIn = person.smsAlertsOptIn === true;
            const hasPhone = Boolean(person.phone);
            return (
              <div
                key={person._id}
                className="flex items-center justify-between gap-4 py-3"
                data-testid={`sms-optin-row-${person._id}`}
              >
                <div className="min-w-0">
                  <strong className="block truncate">
                    {person.givenName} {person.familyName}
                  </strong>
                  {!hasPhone ? (
                    <small className="text-ink-3">No phone on file</small>
                  ) : null}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={optIn}
                  aria-label={`SMS alerts for ${person.givenName} ${person.familyName}`}
                  disabled={busy != null}
                  data-testid={`sms-optin-toggle-${person._id}`}
                  onClick={() => void toggle(person, !optIn)}
                  className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-wait disabled:opacity-60 ${
                    optIn ? "border-brand bg-brand" : "border-line bg-inset"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow-sm transition-transform ${
                      optIn ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
