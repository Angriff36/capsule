import { useState } from "react";

/**
 * "Paste incoming message" for the sales inbox. The DEFAULT view is a human
 * form — who it's from, what they said, and optionally which existing thread
 * it belongs to — because the person logging a forwarded email or a
 * screenshot-ed DM is a sales coordinator, not an integration engineer.
 *
 * Submitting the human form calls the same idempotent ingest action the
 * provider layer uses (ingestInboundMessage), so it creates exactly the same
 * domain records: a MessageThread (found or created) and an inbound Message.
 * A raw provider JSON envelope is still accepted behind the "Advanced" toggle
 * for the copy-the-webhook-body case; that path keeps the §4.4 parse boundary
 * (a malformed payload lands in the sync-error review queue, never lost).
 */

const PROVIDER_LABEL: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  social: "Social",
  other: "Other",
};

/** Minimal thread shape the picker needs (structural — page passes Convex docs). */
export interface PasteThreadOption {
  _id: string;
  provider: string;
  providerAccountId?: string | null;
  providerThreadId?: string | null;
  subject?: string | null;
  senderIdentity?: string | null;
  deletedAt?: number | null;
}

export interface IngestMessageArgs {
  provider: string;
  providerAccountId?: string;
  providerThreadId: string;
  providerMessageId: string;
  senderIdentity?: string;
  bodyText: string;
  subject?: string;
}

export interface IngestMessageResult {
  threadId: string;
  isDuplicate: boolean;
  threadCreated: boolean;
}

export interface IngestEnvelopeArgs {
  provider: string;
  rawJson: string;
}

export interface IngestEnvelopeResult {
  recorded: "ingested" | "sync_error";
  threadId?: string;
  reason?: string;
}

export interface PasteIncomingMessageFormProps {
  threads: readonly PasteThreadOption[];
  ingestMessage: (args: IngestMessageArgs) => Promise<IngestMessageResult>;
  ingestEnvelope: (args: IngestEnvelopeArgs) => Promise<IngestEnvelopeResult>;
  /** Message landed — page shows the notice, selects the thread, closes the form. */
  onLogged: (notice: string, threadId?: string) => void;
  /** Payload was saved to the review queue instead — form stays open to fix typos. */
  onRejected: (notice: string) => void;
  onFailure: (error: unknown) => void;
}

function threadOptionLabel(t: PasteThreadOption): string {
  return (
    t.subject?.trim() ||
    t.senderIdentity?.trim() ||
    (t.providerThreadId ? `Thread ${t.providerThreadId}` : "Untitled thread")
  );
}

export function PasteIncomingMessageForm({
  threads,
  ingestMessage,
  ingestEnvelope,
  onLogged,
  onRejected,
  onFailure,
}: PasteIncomingMessageFormProps) {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [provider, setProvider] = useState<string>("email");
  const [from, setFrom] = useState("");
  const [body, setBody] = useState("");
  const [threadId, setThreadId] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [busy, setBusy] = useState(false);
  // Stable per-entry key: a double-clicked submit replays the same
  // providerMessageId, so the idempotent ingest records exactly one message.
  const [pasteKey, setPasteKey] = useState(() => crypto.randomUUID());

  // Only provider threads can receive more messages; internal threads and
  // threads without a provider thread id are not paste targets.
  const threadChoices = threads.filter(
    (t) =>
      t.deletedAt == null &&
      t.provider === provider &&
      (t.providerThreadId ?? "").trim() !== "",
  );
  const chosenThread = threadChoices.find((t) => t._id === threadId) ?? null;

  const submitHuman = async () => {
    const senderIdentity = from.trim();
    const bodyText = body.trim();
    if (!senderIdentity || !bodyText || busy) return;
    setBusy(true);
    try {
      const result = await ingestMessage({
        provider: chosenThread?.provider ?? provider,
        providerAccountId: chosenThread?.providerAccountId ?? undefined,
        providerThreadId: chosenThread?.providerThreadId ?? `paste:${pasteKey}`,
        providerMessageId: `paste:${pasteKey}`,
        senderIdentity,
        bodyText,
      });
      setFrom("");
      setBody("");
      setThreadId("");
      setPasteKey(crypto.randomUUID());
      onLogged(
        result.isDuplicate
          ? "This message was already logged — nothing new was added."
          : result.threadCreated
            ? "Started a new thread and logged the message."
            : "Logged the message in the existing thread.",
        result.threadId,
      );
    } catch (e) {
      onFailure(e);
    } finally {
      setBusy(false);
    }
  };

  const submitJson = async () => {
    const payload = rawJson.trim();
    if (!payload || busy) return;
    setBusy(true);
    try {
      const result = await ingestEnvelope({ provider, rawJson: payload });
      if (result.recorded === "ingested") {
        setRawJson("");
        onLogged("Message logged from the pasted payload.", result.threadId);
      } else {
        // Kept open with the payload intact so an obvious typo can be fixed;
        // the raw payload is also saved in the review queue below.
        onRejected(
          result.reason ??
            "That payload couldn't be read — it was saved to the review queue below.",
        );
      }
    } catch (e) {
      onFailure(e);
    } finally {
      setBusy(false);
    }
  };

  const providerSelect = (
    <select
      className="input"
      value={provider}
      onChange={(e) => {
        setProvider(e.target.value);
        setThreadId("");
      }}
      aria-label="Provider"
    >
      {Object.entries(PROVIDER_LABEL).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );

  if (mode === "json") {
    return (
      <form
        className="mb-4 grid gap-3 rounded-sm border border-line-2 bg-panel p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submitJson();
        }}
      >
        <p className="text-sm text-ink-2">
          Paste the raw message data from your email, SMS, or social provider
          (JSON). Readable messages land in the right thread; anything that
          can't be read is saved to the review queue below instead of being
          lost.
        </p>
        <div className="grid gap-3 md:grid-cols-[120px_1fr_auto]">
          {providerSelect}
          <textarea
            className="input font-mono text-sm"
            rows={4}
            placeholder='{"threadId": "…", "messageId": "…", "from": "…", "body": "…"}'
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            aria-label="Raw provider message payload"
          />
          <button
            type="submit"
            className="btn btn-primary self-end"
            disabled={busy || rawJson.trim().length === 0}
          >
            {busy ? "Logging…" : "Log message"}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-ghost justify-self-start"
          onClick={() => setMode("form")}
        >
          Back to simple form
        </button>
      </form>
    );
  }

  return (
    <form
      className="mb-4 grid gap-3 rounded-sm border border-line-2 bg-panel p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submitHuman();
      }}
    >
      <p className="text-sm text-ink-2">
        Log a message a client sent you — a forwarded email, a text, or a social
        DM. It lands in the inbox like any other incoming message.
      </p>
      <div className="grid gap-3 md:grid-cols-[120px_1fr_1fr]">
        {providerSelect}
        <input
          className="input"
          placeholder="From (email, phone, or handle)"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From"
        />
        <select
          className="input"
          value={threadId}
          onChange={(e) => setThreadId(e.target.value)}
          aria-label="Thread"
        >
          <option value="">New thread</option>
          {threadChoices.map((t) => (
            <option key={t._id} value={t._id}>
              {threadOptionLabel(t)}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="input"
        rows={3}
        placeholder="What did they say? Paste or type the message text."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Message text"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={
            busy || from.trim().length === 0 || body.trim().length === 0
          }
        >
          {busy ? "Logging…" : "Log message"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setMode("json")}
        >
          Advanced: paste raw JSON
        </button>
      </div>
    </form>
  );
}
