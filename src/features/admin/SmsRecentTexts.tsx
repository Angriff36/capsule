import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../lib/api";
import { publicErrorMessage } from "../../lib/publicErrorMessage";
import { ErrorState } from "../../ui/primitives";
import { useActionFailure, useActionNotice } from "../../ui/action-result";

function formatWhen(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

/**
 * The newest staff alert texts (PL-SMS-SOCIAL, AC-353): who got which alert,
 * whether the text service accepted it, and "Send again" for one text. Each
 * click carries its own request id, so a double click or a repeated call
 * still sends one text.
 */
export function SmsRecentTexts({ canManage }: { readonly canManage: boolean }) {
  const texts = useQuery(api.smsAlertTexts.recentTexts, {});
  const sendAgain = useAction(api.smsAlertTexts.sendAgain);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();

  if (!canManage || !texts || texts.length === 0) return null;

  async function resend(triggerKey: string, personId: string, name: string) {
    const rowKey = `${triggerKey}::${personId}`;
    if (busyKey) return;
    setBusyKey(rowKey);
    setError(null);
    setNotice(null);
    try {
      const result = await sendAgain({
        triggerKey,
        personId,
        requestId: crypto.randomUUID(),
      });
      if (result.status === "not_sent") setError(result.message);
      else setNotice(`${name}: ${result.message}`);
    } catch (cause) {
      setError(publicErrorMessage(cause, "The text could not be sent again."));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mt-5" data-testid="sms-recent-texts">
      <h3 className="text-sm font-semibold text-ink">Recent alert texts</h3>
      <p className="mt-1 text-sm text-ink-3">
        "Accepted" means the text service took the text. Capsule does not yet
        hear back when it reaches the phone.
      </p>
      {error ? (
        <div className="mt-3">
          <ErrorState title="Alert texts" detail={error} />
        </div>
      ) : null}
      {notice ? (
        <p className="mt-3 text-sm text-ok" role="status">
          {notice}
        </p>
      ) : null}
      <ul className="mt-2 divide-y divide-line rounded-sm border border-line">
        {texts.map((text) => {
          const rowKey = `${text.triggerKey}::${text.personId}`;
          return (
            <li
              key={`${rowKey}::${text.at}`}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-semibold text-ink">
                  {text.personName}
                </span>{" "}
                <span className="text-ink-2">{text.alertLabel}</span>{" "}
                <span className="text-ink-3">{formatWhen(text.at)}</span>
                <span
                  className={`block ${text.sent ? "text-ink-3" : "text-warn"}`}
                >
                  {text.sent
                    ? `${text.sentAgain ? "Sent again, accepted" : "Accepted"}${
                        text.providerId
                          ? ` (text number ${text.providerId.slice(-6)})`
                          : ""
                      }`
                    : text.problem}
                </span>
              </span>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busyKey !== null}
                onClick={() =>
                  void resend(text.triggerKey, text.personId, text.personName)
                }
              >
                {busyKey === rowKey ? "Sending…" : "Send again"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
