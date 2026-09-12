// In-app AI assistant drawer. Every action it takes runs in the signed-in
// user's session through the same generated commands the UI uses — the
// assistant is a convenience layer, not a separate authority.
import { useConvex, useMutation } from "convex/react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { api } from "../../lib/api";
import { XIcon } from "../../ui/icons";
import { classifyFile, uploadAssistantFile } from "./assistantClient";
import { useAssistantChat } from "./useAssistantChat";
import type { AssistantFile } from "../../../convex/assistantTurn";

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
  const convex = useConvex();
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<AssistantFile[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  if (!open) return null;

  const acceptFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploadError(null);
    for (const file of Array.from(list)) {
      const verdict = classifyFile(file);
      if (!verdict.ok) {
        setUploadError(verdict.reason);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const uploaded = await uploadAssistantFile(convex, file, verdict.kind);
        setPendingFiles((f) => [...f, uploaded]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const submit = () => {
    const text = draft;
    const files = pendingFiles;
    setDraft("");
    setPendingFiles([]);
    void send(text, files);
  };

  return (
    <aside
      aria-label="AI assistant"
      className={`absolute inset-y-0 right-0 z-30 flex w-100 max-w-[90vw] flex-col border-l border-line bg-panel shadow-lg ${dragOver ? "border-brand" : ""}`}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        void acceptFiles(e.dataTransfer.files);
      }}
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
              <div key={m.id} className="my-2 flex flex-col items-end">
                <div className="max-w-[85%] rounded-md bg-brand px-3 py-1.5 text-white">
                  {m.content}
                </div>
                {m.files?.map((f) => (
                  <span
                    key={f.storageId}
                    className="mt-0.5 text-2xs text-ink-3"
                  >
                    {f.kind === "image" ? "🖼" : "📄"} {f.name}
                  </span>
                ))}
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
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {pendingFiles.map((f) => (
              <span
                key={f.storageId}
                className="flex items-center gap-1 rounded-full border border-line bg-inset px-2 py-0.5 text-xs text-ink-2"
              >
                {f.kind === "image" ? "🖼" : "📄"} {f.name}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() =>
                    setPendingFiles((all) =>
                      all.filter((x) => x.storageId !== f.storageId),
                    )
                  }
                  className="cursor-pointer text-ink-3 hover:text-ink"
                >
                  <XIcon width={10} height={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {uploading > 0 && (
          <div className="mb-2 text-xs text-ink-3">Uploading…</div>
        )}
        {uploadError != null && (
          <div className="mb-2 rounded-sm border border-warn/40 bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
            {uploadError}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            aria-label="Attach a file"
            title="Attach an image or text file (drag-drop works too)"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-sm border border-line bg-canvas text-ink-3 transition-colors hover:border-line-2 hover:text-ink disabled:opacity-40"
          >
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
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.txt,.md,.csv,.json,.tsv,.log,.yml,.yaml,.xml,.html"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              void acceptFiles(e.target.files);
              e.target.value = "";
            }}
          />
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
            disabled={
              busy || (draft.trim().length === 0 && pendingFiles.length === 0)
            }
            className="cursor-pointer rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </footer>
    </aside>
  );
}
