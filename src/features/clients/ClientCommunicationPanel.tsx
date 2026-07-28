import { useUser } from "@clerk/react";
import { useMemo, useState, type FormEvent } from "react";
import type { Doc, Id } from "../../lib/api";
import {
  useCreateClientCommunication,
  useListClientCommunication,
} from "../../lib/manifest-convex-react";
import { formatDate, formatTime } from "../../lib/format";
import { EmptyState, Section, Skeleton } from "../../ui/primitives";
import { CrmFailureBanner } from "./CrmFailureBanner";

const MEDIA = ["call", "email", "meeting"] as const;

export type ClientCommunicationTarget =
  | {
      kind: "contacts";
      contacts: Array<Doc<"clientContacts">>;
    }
  | {
      kind: "event";
      eventId: Id<"events">;
      eventTitle: string;
    };

export interface ClientCommunicationDraft {
  clientContactId?: string;
  eventId?: string;
  occurredAt: Date;
  medium: string;
  summary: string;
  authorName: string;
}

function contactName(contact: Doc<"clientContacts">): string {
  return (
    `${contact.givenName ?? ""} ${contact.familyName ?? ""}`.trim() ||
    contact.email ||
    "Unnamed contact"
  );
}

function localDateTimeValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function mediumLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function occurredLabel(value?: number | null): string {
  return value == null
    ? "Date not recorded"
    : `${formatDate(value)} ${formatTime(value)}`;
}

/** Shared manual communication timeline for Contact and Event detail surfaces. */
export function ClientCommunicationPanel({
  target,
}: {
  target: ClientCommunicationTarget;
}) {
  const { isLoaded, user } = useUser();
  const rows = useListClientCommunication();
  const createCommunication = useCreateClientCommunication();
  const authorName =
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.id ||
    "";

  return (
    <ClientCommunicationPanelView
      target={target}
      rows={rows}
      authorLoaded={isLoaded}
      authorName={authorName}
      onCreate={(draft) => createCommunication(draft)}
    />
  );
}

/** Presentational seam used by the app shell and disposable browser verification. */
export function ClientCommunicationPanelView({
  target,
  rows,
  authorLoaded,
  authorName,
  onCreate,
}: {
  target: ClientCommunicationTarget;
  rows: Array<Doc<"clientCommunications">> | undefined;
  authorLoaded: boolean;
  authorName: string;
  onCreate: (draft: ClientCommunicationDraft) => Promise<unknown>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const contacts = target.kind === "contacts" ? target.contacts : [];
  const activeContacts = contacts.filter(
    (contact) =>
      contact.deletedAt == null && String(contact.status) === "active",
  );
  const contactById = useMemo(
    () => new Map(contacts.map((contact) => [contact._id, contact])),
    [contacts],
  );
  const communications = useMemo(() => {
    const contactIds = new Set(contacts.map((contact) => contact._id));
    return (rows ?? [])
      .filter((row) =>
        target.kind === "event"
          ? row.eventId === target.eventId
          : row.clientContactId != null &&
            contactIds.has(row.clientContactId as Id<"clientContacts">),
      )
      .filter((row) => row.recordedAt != null)
      .sort(
        (left, right) =>
          (right.occurredAt ?? right.recordedAt ?? 0) -
          (left.occurredAt ?? left.recordedAt ?? 0),
      );
  }, [contacts, rows, target]);

  const canRecord =
    authorLoaded &&
    authorName !== "" &&
    (target.kind === "event" || activeContacts.length > 0);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const summary = String(data.get("summary") ?? "").trim();
    const occurredAt = new Date(String(data.get("occurredAt") ?? ""));
    const clientContactId =
      target.kind === "contacts"
        ? String(data.get("clientContactId") ?? "")
        : undefined;

    if (!summary || Number.isNaN(occurredAt.getTime())) {
      setFailure(new Error("Add a date and a short summary."));
      return;
    }
    if (target.kind === "contacts" && !clientContactId) {
      setFailure(new Error("Choose the contact this conversation was with."));
      return;
    }

    setBusy(true);
    setFailure(null);
    setNotice(null);
    void onCreate({
      clientContactId,
      eventId: target.kind === "event" ? target.eventId : undefined,
      occurredAt,
      medium: String(data.get("medium") ?? "call"),
      summary,
      authorName,
    })
      .then(() => {
        form.reset();
        setShowForm(false);
        setNotice("Conversation added to the shared history.");
      })
      .catch(setFailure)
      .finally(() => setBusy(false));
  };

  return (
    <Section
      title="Client communication"
      count={communications.length}
      actions={
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!canRecord}
          onClick={() => {
            setFailure(null);
            setNotice(null);
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Dismiss" : "Add conversation"}
        </button>
      }
    >
      <div className="space-y-3 p-3">
        <p className="max-w-180 text-[12px] leading-relaxed text-ink-2">
          Calls, emails, and meetings stay together here so the next person
          knows what the client was told.
        </p>

        {target.kind === "contacts" && activeContacts.length === 0 ? (
          <p className="rounded-xs border border-line bg-inset/40 p-3 text-[12px] text-ink-2">
            Add an active contact before recording a conversation.
          </p>
        ) : null}
        {failure ? <CrmFailureBanner error={failure} /> : null}
        {notice ? (
          <p className="text-[12px] text-ok" role="status">
            {notice}
          </p>
        ) : null}

        {showForm ? (
          <form
            onSubmit={submit}
            className="grid gap-3 border-l-4 border-brand bg-inset/45 p-4 md:grid-cols-2 xl:grid-cols-4"
          >
            {target.kind === "contacts" ? (
              <label className="field-label">
                Contact
                <select
                  name="clientContactId"
                  className="input"
                  defaultValue={activeContacts[0]?._id ?? ""}
                  required
                >
                  {activeContacts.map((contact) => (
                    <option key={contact._id} value={contact._id}>
                      {contactName(contact)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="field-label">
                Event
                <div className="input flex items-center" aria-label="Event">
                  {target.eventTitle}
                </div>
              </div>
            )}
            <label className="field-label">
              Date &amp; time
              <input
                name="occurredAt"
                type="datetime-local"
                className="input"
                defaultValue={localDateTimeValue()}
                required
              />
            </label>
            <label className="field-label">
              Medium
              <select name="medium" className="input" defaultValue="call">
                {MEDIA.map((medium) => (
                  <option key={medium} value={medium}>
                    {mediumLabel(medium)}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-label">
              Author
              <div className="input flex items-center" aria-label="Author">
                {authorName || "Loading your profile…"}
              </div>
            </div>
            <label className="field-label md:col-span-2 xl:col-span-3">
              Summary
              <textarea
                name="summary"
                className="input min-h-22 resize-y"
                placeholder="What was discussed, decided, or promised?"
                required
                autoFocus
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary self-end"
              disabled={busy || !canRecord}
            >
              {busy ? "Saving…" : "Save conversation"}
            </button>
          </form>
        ) : null}

        {rows === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-18" />
            <Skeleton className="h-18" />
          </div>
        ) : communications.length === 0 ? (
          <EmptyState
            title="No conversations recorded"
            hint="Add the first call, email, or meeting note for this client."
          />
        ) : (
          <div className="ml-2 border-l border-line">
            {communications.map((communication) => {
              const contact = communication.clientContactId
                ? contactById.get(communication.clientContactId)
                : undefined;
              return (
                <article
                  key={communication._id}
                  className="relative border-b border-line px-5 py-4 last:border-b-0"
                >
                  <span
                    className="absolute -left-[5px] top-5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-brand"
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="chip border-brand/20 bg-sage-1/55 text-brand">
                      {mediumLabel(String(communication.medium))}
                    </span>
                    <time className="font-mono text-[10px] text-ink-3">
                      {occurredLabel(communication.occurredAt)}
                    </time>
                    {contact ? (
                      <span className="text-[11px] text-ink-3">
                        with {contactName(contact)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                    {communication.summary}
                  </p>
                  <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
                    Added by {communication.authorName}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}
