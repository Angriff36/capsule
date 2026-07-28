import { useUser } from "@clerk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateStaffMessage,
  useListPerson,
  useListStaffMessage,
  useStaffMessageMarkRead,
} from "../../lib/manifest-convex-react";
import { EmptyState, TableSkeleton } from "../../ui/primitives";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

/** Messages older than this drop out of the UI — 90-day retention window. */
export const MESSAGE_RETENTION_MS = 90 * 86_400_000;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function MessagesPage() {
  const { user } = useUser();
  const people = useListPerson();
  const messages = useListStaffMessage();
  const send = useCreateStaffMessage();
  const markRead = useStaffMessageMarkRead();

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const me = useMemo(
    () =>
      user?.id
        ? (people ?? []).find(
            (p) => p.authSubjectId === user.id && p.deletedAt == null,
          )
        : undefined,
    [people, user?.id],
  );

  const cutoff = Date.now() - MESSAGE_RETENTION_MS;
  // ponytail: retention is a read-side window; add a purge cron if storage
  // or compliance ever requires hard deletion.
  const visibleMessages = useMemo(
    () =>
      (messages ?? []).filter(
        (m) => m.deletedAt == null && (m.createdAt ?? 0) >= cutoff,
      ),
    [messages, cutoff],
  );

  const contacts = useMemo(() => {
    const unreadBySender = new Map<string, number>();
    const lastBySender = new Map<string, number>();
    if (me) {
      for (const m of visibleMessages) {
        const other =
          m.senderPersonId === me._id
            ? String(m.recipientPersonId)
            : m.recipientPersonId === me._id
              ? String(m.senderPersonId)
              : null;
        if (other == null) continue;
        lastBySender.set(
          other,
          Math.max(lastBySender.get(other) ?? 0, m.createdAt ?? 0),
        );
        if (m.recipientPersonId === me._id && m.readAt == null) {
          unreadBySender.set(other, (unreadBySender.get(other) ?? 0) + 1);
        }
      }
    }
    return (people ?? [])
      .filter((p) => p.deletedAt == null && p._id !== me?._id)
      .map((p) => ({
        person: p,
        unread: unreadBySender.get(String(p._id)) ?? 0,
        lastAt: lastBySender.get(String(p._id)) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.lastAt - a.lastAt ||
          `${a.person.givenName} ${a.person.familyName}`.localeCompare(
            `${b.person.givenName} ${b.person.familyName}`,
          ),
      );
  }, [people, visibleMessages, me]);

  const selected = contacts.find((c) => c.person._id === selectedPersonId);
  const thread = useMemo(
    () =>
      me && selectedPersonId
        ? visibleMessages
            .filter(
              (m) =>
                (m.senderPersonId === me._id &&
                  m.recipientPersonId === selectedPersonId) ||
                (m.senderPersonId === selectedPersonId &&
                  m.recipientPersonId === me._id),
            )
            .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        : [],
    [visibleMessages, me, selectedPersonId],
  );

  // Opening a thread clears its unread markers (recipient-only command).
  useEffect(() => {
    if (!me) return;
    for (const m of thread) {
      if (m.recipientPersonId === me._id && m.readAt == null) {
        void markRead({ docId: m._id, version: m.version }).catch(() => {
          // Read receipts are best-effort; the thread itself already rendered.
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, me?._id]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length, selectedPersonId]);

  const submit = async () => {
    if (!me || !selected || sending) return;
    const body = draft.trim();
    if (body.length === 0) return;
    setFailure(null);
    setSending(true);
    try {
      await send({
        senderPersonId: me._id,
        recipientPersonId: selected.person._id,
        ...(selected.person.authSubjectId
          ? { recipientAuthSubjectId: selected.person.authSubjectId }
          : {}),
        body,
      });
      setDraft("");
    } catch (error) {
      setFailure(error);
    } finally {
      setSending(false);
    }
  };

  const personName = (p: { givenName: string; familyName: string }) =>
    `${p.givenName} ${p.familyName}`.trim();
  const totalUnread = contacts.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Messages</p>
          <h1 className="display-title mt-2">Direct messages</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Message any teammate directly — separate from client communication.
            Threads stay available for 90 days.
          </p>
        </div>
        <div className="rounded-sm border border-brand/20 bg-brand-soft px-5 py-4 text-center">
          <p className="text-[28px] leading-none font-semibold text-brand">
            {totalUnread}
          </p>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-ink-2 uppercase">
            Unread
          </p>
        </div>
      </header>
      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {people === undefined || messages === undefined ? (
        <TableSkeleton rows={4} />
      ) : me == null ? (
        <div className="empty-state">
          <strong>No staff profile linked to your account</strong>
          <span>
            Ask a manager to link your sign-in to your staff record to send and
            receive messages.
          </span>
        </div>
      ) : (
        <section
          className="working-ledger grid md:grid-cols-[260px_1fr]"
          data-testid="staff-messages"
        >
          <div className="border-line-2 max-md:border-b md:border-r">
            <p className="eyebrow px-4 pt-4">Teammates</p>
            {contacts.length === 0 ? (
              <EmptyState
                title="No other staff members yet"
                hint="Teammates appear here once they are added to the roster."
              />
            ) : (
              <ul className="max-h-130 overflow-y-auto p-2">
                {contacts.map(({ person, unread }) => (
                  <li key={person._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPersonId(String(person._id))}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xs px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-inset ${
                        person._id === selectedPersonId
                          ? "bg-inset font-medium"
                          : ""
                      }`}
                    >
                      <span>{personName(person)}</span>
                      {unread > 0 && (
                        <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-white">
                          {unread}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex min-h-100 flex-col">
            {selected == null ? (
              <div className="empty-state m-4">
                <strong>Pick a teammate</strong>
                <span>Select someone on the left to open your thread.</span>
              </div>
            ) : (
              <>
                <div className="border-b border-line-2 px-4 py-3">
                  <p className="text-[15px] font-semibold">
                    {personName(selected.person)}
                  </p>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {thread.length === 0 ? (
                    <EmptyState
                      title="No messages in the last 90 days"
                      hint="Say hello."
                    />
                  ) : (
                    thread.map((m) => {
                      const mine = m.senderPersonId === me._id;
                      return (
                        <div
                          key={m._id}
                          className={`max-w-[75%] rounded-sm px-3 py-2 ${
                            mine
                              ? "ml-auto bg-brand-soft"
                              : "mr-auto border border-line-2 bg-panel"
                          }`}
                        >
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                            {m.body}
                          </p>
                          <p className="mt-1 text-[10.5px] text-ink-3">
                            {timeFormat.format(m.createdAt ?? 0)}
                            {mine && m.readAt != null ? " · Read" : ""}
                          </p>
                        </div>
                      );
                    })
                  )}
                  <div ref={threadEndRef} />
                </div>
                <form
                  className="flex min-w-0 gap-2 border-t border-line-2 px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`Message ${personName(selected.person)}…`}
                    className="input min-w-0 flex-1"
                    aria-label="Message text"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={sending || draft.trim().length === 0}
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
