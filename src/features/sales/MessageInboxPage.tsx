import { useMemo, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../lib/api";
import {
  useCreateMessage,
  useListClientContact,
  useListLead,
  useListMessage,
  useListMessageThread,
  useMessageThreadCreate,
  useMessageThreadLinkLead,
  useMessageThreadSetStatus,
} from "../../lib/manifest-convex-react";
import { classifyCommandFailure } from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { formatTime } from "../../lib/format";
import { TableSkeleton } from "../../ui/primitives";
import { ClientsWorkspaceNav } from "../clients/ClientsWorkspaceNav";
import type { Doc } from "../../lib/api";

type Thread = Doc<"messageThreads">;
type Failure = ReturnType<typeof classifyCommandFailure>;

const PROVIDER_LABEL: Record<string, string> = {
  internal: "Internal",
  email: "Email",
  sms: "SMS",
  social: "Social",
  other: "Other",
};

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function threadTitle(t: Thread): string {
  return (
    t.subject?.trim() ||
    t.senderIdentity?.trim() ||
    (t.providerThreadId ? `Thread ${t.providerThreadId}` : "Untitled thread")
  );
}

/**
 * Sales inbox for provider-neutral message threads (email / SMS / social DM /
 * internal). Shows the source network and any linked lead ("deal") per spec
 * §4.4 "Done when": a staff reply/history view shows the source network and
 * linked event/deal. "Log inbound" exercises the idempotent ingestInboundMessage
 * action — replaying the same provider message id creates no duplicate.
 */
export function MessageInboxPage() {
  const threads = useListMessageThread();
  const messages = useListMessage();
  const leads = useListLead();
  const contacts = useListClientContact();
  const ingest = useAction(api.messageInbox.ingestInboundMessage);
  const createThread = useMessageThreadCreate();
  const createMessage = useCreateMessage();
  const linkLead = useMessageThreadLinkLead();
  const setStatus = useMessageThreadSetStatus();
  const qualify = useAction(api.messageInbox.qualifyThreadAsLead);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [qualifying, setQualifying] = useState(false);

  // New-thread inline form.
  const [showNew, setShowNew] = useState(false);
  const [ntProvider, setNtProvider] = useState<string>("internal");
  const [ntSender, setNtSender] = useState("");
  const [ntSubject, setNtSubject] = useState("");
  const [ntThreadRef, setNtThreadRef] = useState("");

  // Log-inbound inline form.
  const [showLog, setShowLog] = useState(false);
  const [liMsgId, setLiMsgId] = useState("");
  const [liBody, setLiBody] = useState("");
  const [liSender, setLiSender] = useState("");

  const visibleThreads = useMemo(
    () => (threads ?? []).filter((t) => t.deletedAt == null),
    [threads],
  );
  const selected = visibleThreads.find((t) => t._id === selectedId) ?? null;

  const threadMessages = useMemo(
    () =>
      selected
        ? (messages ?? [])
            .filter((m) => m.threadId === selected._id && m.deletedAt == null)
            .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        : [],
    [messages, selected],
  );

  const leadName = (leadId: string | null | undefined) => {
    if (!leadId) return null;
    const lead = (leads ?? []).find((l) => l._id === leadId);
    if (!lead) return "Linked lead";
    return (
      lead.companyName?.trim() ||
      [lead.givenName, lead.familyName].filter(Boolean).join(" ").trim() ||
      "Linked lead"
    );
  };
  const contactName = (contactId: string | null | undefined) => {
    if (!contactId) return null;
    const c = (contacts ?? []).find((x) => x._id === contactId);
    return c
      ? [c.givenName, c.familyName].filter(Boolean).join(" ").trim()
      : null;
  };

  const fail = (e: unknown) => setFailure(classifyCommandFailure(e));

  const submitNewThread = async () => {
    setFailure(null);
    setNotice(null);
    try {
      const result = await createThread({
        provider: ntProvider as Thread["provider"],
        providerThreadId: ntThreadRef.trim() || undefined,
        subject: ntSubject.trim() || undefined,
        senderIdentity: ntSender.trim() || undefined,
      });
      setShowNew(false);
      setNtSender("");
      setNtSubject("");
      setNtThreadRef("");
      setSelectedId(result._id);
    } catch (e) {
      fail(e);
    }
  };

  const submitReply = async () => {
    if (!selected || sending) return;
    const body = reply.trim();
    if (!body) return;
    setFailure(null);
    setSending(true);
    try {
      // Internal threads record the reply as sent (no external delivery). For
      // any real provider the message is queued — this increment has no
      // provider/outbox wired, so we never claim "sent" for an unsent message;
      // a future provider worker moves queued -> sent on acknowledgement.
      await createMessage({
        threadId: selected._id,
        direction: "outbound",
        status: selected.provider === "internal" ? "sent" : "queued",
        bodyText: body,
      });
      setReply("");
    } catch (e) {
      fail(e);
    } finally {
      setSending(false);
    }
  };

  const submitLogInbound = async () => {
    if (!selected) return;
    setFailure(null);
    setNotice(null);
    const providerMessageId = liMsgId.trim();
    const body = liBody.trim();
    if (!selected.providerThreadId) {
      setFailure(
        classifyCommandFailure(
          new Error("This thread has no provider thread id to ingest against"),
        ),
      );
      return;
    }
    if (!providerMessageId || !body) {
      setFailure(
        classifyCommandFailure(
          new Error("Provider message id and body are required"),
        ),
      );
      return;
    }
    try {
      const result = await ingest({
        provider: selected.provider,
        providerAccountId: selected.providerAccountId ?? undefined,
        providerThreadId: selected.providerThreadId,
        providerMessageId,
        senderIdentity: liSender.trim() || selected.senderIdentity || undefined,
        bodyText: body,
      });
      setNotice(
        result.isDuplicate
          ? "Duplicate provider message — no new record created (idempotent)."
          : result.threadCreated
            ? "Created a new thread and ingested the message."
            : "Ingested the inbound message into the existing thread.",
      );
      setLiMsgId("");
      setLiBody("");
      setLiSender("");
      setShowLog(false);
    } catch (e) {
      fail(e);
    }
  };

  const linkLeadToSelected = async (leadId: string) => {
    if (!selected || !leadId) return;
    setFailure(null);
    try {
      await linkLead({
        docId: selected._id,
        leadId: leadId as Doc<"leads">["_id"],
        version: selected.version,
      });
    } catch (e) {
      fail(e);
    }
  };

  const archiveSelected = async () => {
    if (!selected) return;
    setFailure(null);
    try {
      await setStatus({
        docId: selected._id,
        status: "archived",
        version: selected.version,
      });
    } catch (e) {
      fail(e);
    }
  };

  // One-click qualify: create a new Lead from this thread and link it (spec
  // §4.4 "create an Inquiry/Lead when the thread first becomes sales-
  // qualified"). Replaces the old "leave the inbox → create a lead elsewhere →
  // come back → pick it from the dropdown" flow. Idempotent server-side.
  const qualifySelected = async () => {
    if (!selected || qualifying) return;
    setFailure(null);
    setNotice(null);
    setQualifying(true);
    try {
      const result = await qualify({ threadId: selected._id });
      setNotice(
        result.created
          ? "Created a new lead from this thread and linked it."
          : "This thread is already linked to a lead.",
      );
    } catch (e) {
      fail(e);
    } finally {
      setQualifying(false);
    }
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Inbox</p>
          <h1 className="display-title mt-2">Message inbox</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Threaded conversations across email, SMS, social DM, and internal
            notes — separate from staff direct messages. Linked leads appear
            alongside each thread.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? "Cancel" : "New thread"}
        </button>
      </header>
      <ClientsWorkspaceNav />
      {failure ? <FailureBanner failure={failure} /> : null}
      {notice ? (
        <p className="mb-3 rounded-sm bg-green-50 px-4 py-2 text-[13px] text-green-800">
          {notice}
        </p>
      ) : null}

      {showNew ? (
        <form
          className="mb-4 grid gap-3 rounded-sm border border-line-2 bg-panel p-4 md:grid-cols-[120px_1fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void submitNewThread();
          }}
        >
          <select
            className="input"
            value={ntProvider}
            onChange={(e) => setNtProvider(e.target.value)}
            aria-label="Provider"
          >
            {Object.entries(PROVIDER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="From (sender identity)"
            value={ntSender}
            onChange={(e) => setNtSender(e.target.value)}
          />
          <input
            className="input"
            placeholder="Subject"
            value={ntSubject}
            onChange={(e) => setNtSubject(e.target.value)}
          />
          <input
            className="input"
            placeholder="Provider thread id (optional)"
            value={ntThreadRef}
            onChange={(e) => setNtThreadRef(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Open
          </button>
        </form>
      ) : null}

      {threads === undefined || messages === undefined ? (
        <TableSkeleton rows={5} />
      ) : visibleThreads.length === 0 ? (
        <div className="empty-state">
          <strong>No message threads yet</strong>
          <span>
            Open a thread to start, or ingest an inbound provider message.
          </span>
        </div>
      ) : (
        <section
          className="working-ledger grid md:grid-cols-[300px_1fr]"
          data-testid="message-inbox"
        >
          <ul className="max-h-140 overflow-y-auto border-line-2 max-md:border-b md:border-r">
            {visibleThreads.map((t) => {
              const lastAt = (messages ?? [])
                .filter((m) => m.threadId === t._id)
                .reduce((max, m) => Math.max(max, m.createdAt ?? 0), 0);
              return (
                <li key={t._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(t._id);
                      setNotice(null);
                    }}
                    className={`w-full cursor-pointer border-b border-line-2 px-3 py-2 text-left transition-colors hover:bg-inset ${
                      t._id === selectedId ? "bg-inset" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium">
                        {threadTitle(t)}
                      </span>
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
                        {PROVIDER_LABEL[t.provider] ?? t.provider}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-3">
                      {contactName(t.contactId) ?? t.senderIdentity ?? "—"}
                      {leadName(t.leadId) ? ` · ${leadName(t.leadId)}` : ""}
                      {t.status === "archived" ? " · archived" : ""}
                    </p>
                    {lastAt > 0 ? (
                      <p className="text-[10.5px] text-ink-3">
                        {timeFormat.format(lastAt)}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex min-h-100 flex-col">
            {selected == null ? (
              <div className="empty-state m-4">
                <strong>Pick a thread</strong>
                <span>Select a conversation to read and reply.</span>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-4 py-3">
                  <div className="mr-auto">
                    <p className="text-[15px] font-semibold">
                      {threadTitle(selected)}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      {PROVIDER_LABEL[selected.provider] ?? selected.provider}
                      {selected.providerAccountId
                        ? ` · ${selected.providerAccountId}`
                        : ""}
                      {selected.providerThreadId
                        ? ` · ${selected.providerThreadId}`
                        : ""}
                      {contactName(selected.contactId)
                        ? ` · ${contactName(selected.contactId)}`
                        : ""}
                    </p>
                  </div>
                  <select
                    className="input max-w-48"
                    value={selected.leadId ?? ""}
                    onChange={(e) => void linkLeadToSelected(e.target.value)}
                    aria-label="Link lead"
                  >
                    <option value="">
                      {leadName(selected.leadId) ?? "Link lead…"}
                    </option>
                    {(leads ?? [])
                      .filter((l) => l.deletedAt == null)
                      .map((l) => {
                        const name =
                          l.companyName?.trim() ||
                          [l.givenName, l.familyName]
                            .filter(Boolean)
                            .join(" ")
                            .trim() ||
                          "Untitled lead";
                        return (
                          <option key={l._id} value={l._id}>
                            {name}
                          </option>
                        );
                      })}
                  </select>
                  {!selected.leadId ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void qualifySelected()}
                      disabled={qualifying}
                      title="Create a new lead from this thread and link it"
                    >
                      {qualifying ? "Qualifying…" : "Qualify as Lead"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowLog((v) => !v)}
                    disabled={!selected.providerThreadId}
                    title={
                      selected.providerThreadId
                        ? "Log an inbound provider message"
                        : "Only provider threads (with a provider thread id) can ingest inbound"
                    }
                  >
                    {showLog ? "Cancel" : "Log inbound"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void archiveSelected()}
                    disabled={selected.status === "archived"}
                  >
                    Archive
                  </button>
                </div>

                {showLog ? (
                  <form
                    className="grid gap-2 border-b border-line-2 bg-inset px-4 py-3 md:grid-cols-[1fr_auto]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitLogInbound();
                    }}
                  >
                    <div className="grid gap-2">
                      <input
                        className="input"
                        placeholder="Provider message id (dedup key)"
                        value={liMsgId}
                        onChange={(e) => setLiMsgId(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Sender (optional)"
                        value={liSender}
                        onChange={(e) => setLiSender(e.target.value)}
                      />
                      <textarea
                        className="input"
                        rows={2}
                        placeholder="Inbound message text (plain text)"
                        value={liBody}
                        onChange={(e) => setLiBody(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary self-end">
                      Ingest
                    </button>
                  </form>
                ) : null}

                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {threadMessages.length === 0 ? (
                    <p className="text-[12px] text-ink-3">
                      No messages yet. Reply or log an inbound below.
                    </p>
                  ) : (
                    threadMessages.map((m) => {
                      const mine = m.direction === "outbound";
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
                            {m.bodyText}
                          </p>
                          <p className="mt-1 text-[10.5px] text-ink-3">
                            {m.createdAt ? formatTime(m.createdAt) : ""}
                            {m.senderIdentity ? ` · ${m.senderIdentity}` : ""}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  className="flex min-w-0 gap-2 border-t border-line-2 px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitReply();
                  }}
                >
                  <input
                    type="text"
                    className="input min-w-0 flex-1"
                    placeholder="Reply to this thread…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    aria-label="Reply text"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={sending || reply.trim().length === 0}
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
