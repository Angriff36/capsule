import type { Doc } from "../../lib/api";

type EventContact = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type Props = {
  eventContact: EventContact;
  contacts: Doc<"clientContacts">[];
};

function contactName(contact: Doc<"clientContacts">): string {
  return (
    `${contact.givenName ?? ""} ${contact.familyName ?? ""}`.trim() ||
    contact.email ||
    "Unnamed contact"
  );
}

function ContactLines({
  email,
  phone,
}: {
  email?: string | null;
  phone?: string | null;
}) {
  if (!email && !phone)
    return <p className="mt-1.5 text-base text-ink-3">No contact recorded.</p>;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-base">
      {email ? (
        <a className="link" href={`mailto:${email}`}>
          {email}
        </a>
      ) : null}
      {phone ? (
        <a className="link" href={`tel:${phone}`}>
          {phone}
        </a>
      ) : null}
    </p>
  );
}

/**
 * Who to call about this event. The event's own primary contact leads —
 * it is the person this booking names — and the client's CRM contact roster
 * follows underneath. Roles come from the stored flags, never guessed.
 */
export function EventClientContactsPanel({ eventContact, contacts }: Props) {
  return (
    <section className="card p-4">
      <div className="section-rule">
        <span>Contacts</span>
        <i />
        <em>{contacts.length} on the client record</em>
      </div>

      <div className="mt-3.5 rounded-sm border border-brand/40 bg-brand-soft/50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-ink">
            {eventContact.name || "No event contact named"}
          </span>
          <span className="chip border-brand/30 bg-panel text-brand">
            Event contact
          </span>
        </div>
        <ContactLines email={eventContact.email} phone={eventContact.phone} />
      </div>

      {contacts.length === 0 ? (
        <p className="mt-3 text-base text-ink-3">
          This client has no contact roster yet. Add contacts on the client
          record.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {contacts.map((contact) => (
            <li key={contact._id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-ink">
                  {contactName(contact)}
                </span>
                {contact.isPrimary ? (
                  <span className="chip border-line-2 bg-inset text-ink-2">
                    Primary
                  </span>
                ) : null}
                {contact.isBillingContact ? (
                  <span className="chip border-line-2 bg-inset text-ink-2">
                    Billing
                  </span>
                ) : null}
                {contact.title ? (
                  <span className="text-sm text-ink-3">{contact.title}</span>
                ) : null}
              </div>
              <ContactLines
                email={contact.email}
                phone={contact.phone ?? contact.mobile}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
