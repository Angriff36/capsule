import { useEmailInboxSetup } from "../../lib/emailInboxSetup";
import { Section } from "../../ui/primitives";

/** The company's Capsule inbox address; client emails to it land in the inbox. */
export function EmailInboxSection() {
  const setup = useEmailInboxSetup();
  if (!setup) return null;

  return (
    <Section title="Client emails">
      {setup.emailsReady && setup.inboxAddress ? (
        <div className="grid gap-2 text-sm text-ink-2">
          <p>
            Emails clients send to{" "}
            <code className="break-all">{setup.inboxAddress}</code> come into
            the inbox, one conversation per client email address.
          </p>
          <p>
            When "Replies go to" above is empty, clients who answer an invoice,
            proposal or reminder email reach this address. To get the emails
            sent to your own mailbox too, forward it to this address.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          <p className="text-warn">
            Client emails are not switched on for Capsule yet, so no client
            emails come into the inbox.
          </p>
          {setup.webhookAddress ? (
            <p className="text-ink-2">
              To switch them on, in the email service add a receiving domain and
              a webhook for "email received" that posts to{" "}
              <code className="break-all">{setup.webhookAddress}</code>
            </p>
          ) : null}
        </div>
      )}
    </Section>
  );
}
