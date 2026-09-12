// In-app AI assistant drawer. Every action it takes runs in the signed-in
// user's session through the same generated commands the UI uses — the
// assistant is a convenience layer, not a separate authority.
import { useEffect, useRef, useState } from "react";
import { XIcon } from "../../ui/icons";
import { useAssistantChat } from "./useAssistantChat";

function SparkIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  );
}

function ToolCallChip({ name, content }: { name: string; content: string }) {
  let failed = false;
  try {
    failed = JSON.parse(content)?.error != null;
  } catch {
    failed = true;
  }
  return (
    <details className="my-1 rounded-sm border border-line bg-inset text-xs">
      <summary
        className={`cursor-pointer px-2 py-1 ${failed ? "text-warn" : "text-ink-2"}`}
      >
        <span aria-hidden="true">{failed ? "✕" : "✓"}</span> {name}
      </summary>
      <pre className="overflow-x-auto px-2 pb-1.5 text-2xs whitespace-pre-wrap text-ink-3">
        {content}
      </pre>
    </details>
  );
}

export function AssistantPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { messages, busy, error, send, reset } = useAssistantChat();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  if (!open) return null;

  const submit = () => {
    const text = draft;
    setDraft("");
    void send(text);
  };

  return (
    <aside
      aria-label="AI assistant"
      className="absolute inset-y-0 right-0 z-30 flex w-100 max-w-[90vw] flex-col border-l border-line bg-panel shadow-lg"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-brand">
          <SparkIcon />
        </span>
        <h2 className="text-sm font-semibold">Assistant</h2>
        <span className="text-2xs text-ink-3 max-md:hidden">
          Acts as you — changes are real
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="ml-auto cursor-pointer text-xs text-ink-3 transition-colors hover:text-ink disabled:cursor-default disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-xs text-ink-3 transition-colors hover:border-line-2 hover:bg-inset hover:text-ink"
        >
          <XIcon width={14} height={14} />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm"
      >
        {messages.length === 0 && (
          <div className="mt-6 text-xs leading-relaxed text-ink-3">
            <p>
              Ask about events, dishes, prep tasks, or clients. I can look
              things up and make changes for you.
            </p>
            <p className="mt-2">
              Try: “What’s on the calendar next week?” or “Create a prep task
              to…”. I may ask before retiring or cancelling anything.
            </p>
          </div>
        )}
        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="my-2 flex justify-end">
                <div className="max-w-[85%] rounded-md bg-brand px-3 py-1.5 text-white">
                  {m.content}
                </div>
              </div>
            );
          }
          if (m.role === "tool") {
            return (
              <ToolCallChip
                key={m.id}
                name={m.toolName ?? "tool"}
                content={m.content}
              />
            );
          }
          return (
            <div
              key={m.id}
              className="my-2 leading-relaxed whitespace-pre-wrap"
            >
              {m.content}
              {m.toolCalls?.map((c) => (
                <div
                  key={c.id}
                  className="mt-1 text-xs text-ink-3"
                >{`→ ${c.name}…`}</div>
              ))}
            </div>
          );
        })}
        {busy && <div className="my-2 text-xs text-ink-3">Thinking…</div>}
        {error != null && (
          <div className="my-2 rounded-sm border border-warn/40 bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
            {error}
          </div>
        )}
      </div>

      <footer className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Ask the assistant…"
            disabled={busy}
            className="min-h-0 flex-1 resize-none rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-brand/50 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || draft.trim().length === 0}
            className="cursor-pointer rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </footer>
    </aside>
  );
}
