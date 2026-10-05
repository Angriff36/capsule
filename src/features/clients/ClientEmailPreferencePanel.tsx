import { useState, type FormEvent } from "react";
import { useClientSetEmailPreference } from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";

type EmailChoice = "every_email" | "no_reminders" | "none";

const CHOICES: Array<{ value: EmailChoice; label: string; hint: string }> = [
  {
    value: "every_email",
    label: "Every email",
    hint: "Invoices, proposals and automatic payment reminders.",
  },
  {
    value: "no_reminders",
    label: "No payment reminders",
    hint: "Staff can still email invoices and proposals; automatic and Send reminder now emails stop.",
  },
  {
    value: "none",
    label: "No emails",
    hint: "Capsule sends this client nothing. Replies to messages they send us still go.",
  },
];

export interface ClientEmailPreferenceRow {
  _id: string;
  version: number;
  emailPreference?: string | null;
  emailPreferenceNote?: string | null;
  emailPreferenceSetAt?: number | null;
}

function choiceOf(raw: string | null | undefined): EmailChoice {
  return raw === "no_reminders" || raw === "none" ? raw : "every_email";
}

/**
 * The client's own choice about email (PL-CONSENT). Capsule reads it at the
 * moment it sends, so a change also stops reminders already scheduled.
 */
export function ClientEmailPreferencePanel({
  client,
  busy,
  run,
  onSaved,
}: {
  client: ClientEmailPreferenceRow;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => void;
  onSaved: (message: string) => void;
}) {
  const setEmailPreference = useClientSetEmailPreference();
  const [choice, setChoice] = useState<EmailChoice>(
    choiceOf(client.emailPreference),
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = String(
      new FormData(event.currentTarget).get("note") ?? "",
    ).trim();
    run("email-preference", async () => {
      await setEmailPreference({
        docId: client._id,
        version: client.version,
        preference: choice,
        note: note || undefined,
      });
      onSaved(
        `Saved: ${CHOICES.find((row) => row.value === choice)?.label}. Reminders already scheduled follow this too.`,
      );
    });
  };

  return (
    <form className="supply-form" onSubmit={submit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Email</p>
          <h2>What we email this client</h2>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="sr-only">What we email this client</legend>
        {CHOICES.map((row) => (
          <label key={row.value} className="supply-check items-start">
            <input
              type="radio"
              name="emailPreference"
              value={row.value}
              checked={choice === row.value}
              onChange={() => setChoice(row.value)}
            />{" "}
            <span>
              {row.label}
              <span className="field-hint block">{row.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label>
        Note
        <input
          name="note"
          defaultValue={client.emailPreferenceNote ?? ""}
          placeholder="Asked on the phone to stop reminders"
        />
        <span className="field-hint">
          {client.emailPreferenceSetAt
            ? `Last changed ${formatDate(client.emailPreferenceSetAt)}.`
            : "Optional — why the client asked."}
        </span>
      </label>
      <button className="btn btn-ghost" type="submit" disabled={busy != null}>
        Save email choice
      </button>
    </form>
  );
}
