import { useAction } from "convex/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useLocation } from "react-router-dom";
import { api, type Id } from "../../lib/api";
import {
  useCreatePageFeedback,
  useListPageFeedback,
  usePageFeedbackMarkResolved,
  usePageFeedbackRemove,
  usePageFeedbackReopen,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { reportActionFail, reportActionOk } from "../../ui/action-result";
import { ReviewerToolbarCommentRow } from "./ReviewerToolbarCommentRow";
import { useFeedbackGithubSync } from "./useFeedbackGithubSync";

/** Capsule roles that leave screen comments. */
const REVIEWER_ROLES = new Set(["owner", "admin", "system"]);

type Kind = "improvement" | "missing" | "broken";

const KINDS: { value: Kind; label: string }[] = [
  { value: "improvement", label: "Improve this" },
  { value: "missing", label: "Something is missing" },
  { value: "broken", label: "Something is broken" },
];

type Feedback = {
  _id: Id<"pageFeedbacks">;
  pagePath: string;
  pageTitle?: string | null;
  targetLabel?: string | null;
  targetSelector?: string | null;
  offsetX?: number | null;
  offsetY?: number | null;
  kind: string;
  body: string;
  status: string;
  leftAt?: number | null;
  leftByName?: string | null;
  issueUrl?: string | null;
  issueNumber?: number | null;
  version?: number;
  deletedAt?: number | null;
};

type Draft = {
  x: number;
  y: number;
  targetLabel: string;
  targetSelector: string;
  offsetX: number;
  offsetY: number;
};

const LAYER_ATTR = "data-feedback-layer";

/** A CSS path from <body> (or the nearest stable id) to the element. */
function cssPath(element: Element): string {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.id && !/\d{4,}|:/.test(node.id)) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      return parts.join(" > ");
    }
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const tag = node.tagName;
    const same = Array.from(parent.children).filter((c) => c.tagName === tag);
    const name = tag.toLowerCase();
    parts.unshift(
      same.length > 1 ? `${name}:nth-of-type(${same.indexOf(node) + 1})` : name,
    );
    node = parent;
  }
  return ["body", ...parts].join(" > ");
}

/** The clicked thing in words: its label or its text. */
function describe(element: Element): string {
  const named =
    element.getAttribute("aria-label") ??
    element.getAttribute("title") ??
    element.getAttribute("placeholder") ??
    element.textContent ??
    "";
  const text = named.replace(/\s+/g, " ").trim().slice(0, 80);
  const tag = element.tagName.toLowerCase();
  return text ? `${tag} "${text}"` : tag;
}

function pageTitle(): string {
  const heading = document.querySelector("main h1, h1");
  return (heading?.textContent ?? document.title).replace(/\s+/g, " ").trim();
}

/** The element under a point, skipping the comment layer itself. */
function elementAt(x: number, y: number): Element | null {
  return (
    document
      .elementsFromPoint(x, y)
      .find((el) => !el.closest(`[${LAYER_ATTR}]`)) ?? null
  );
}

function pinPoint(row: Feedback): { x: number; y: number } | null {
  if (!row.targetSelector) return null;
  let element: Element | null = null;
  try {
    element = document.querySelector(row.targetSelector);
  } catch {
    return null;
  }
  if (!element) return null;
  const box = element.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return {
    x: box.left + (row.offsetX ?? 0.5) * box.width,
    y: box.top + (row.offsetY ?? 0.5) * box.height,
  };
}

/** Redraw pins when the page scrolls, resizes or changes under them. */
function useLayoutTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const bump = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTick((n) => n + 1));
    };
    window.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
    const timer = window.setInterval(bump, 1000);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", bump, true);
      window.removeEventListener("resize", bump);
      window.clearInterval(timer);
    };
  }, [active]);
  return tick;
}

/**
 * Screen comments for admins (Ryan 2026-10-13: "allow any admins in capsule
 * to comment on anything on the page ... bypass vercel automatically. have it
 * set up to ping you every time feedback is given"). Replaces the Vercel
 * Toolbar: click a spot, write what to change, and the comment is pinned
 * there for every admin and sent to Claude as a GitHub issue.
 */
export function ReviewerToolbar() {
  const status = useAuthStatus();
  if (!REVIEWER_ROLES.has(String(status?.role ?? ""))) return null;
  return <FeedbackLayer />;
}

function FeedbackLayer() {
  const location = useLocation();
  const rows = useListPageFeedback() as Feedback[] | undefined;
  const create = useCreatePageFeedback();
  const resolve = usePageFeedbackMarkResolved();
  const reopen = usePageFeedbackReopen();
  const remove = usePageFeedbackRemove();
  const fileIssue = useAction(api.pageFeedback.fileIssue);

  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kind, setKind] = useState<Kind>("improvement");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [scope, setScope] = useState<"page" | "all">("page");
  const [showResolved, setShowResolved] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [addressingId, setAddressingId] = useState<string | null>(null);
  const [workingIds, setWorkingIds] = useState<Record<string, true>>({});
  const [failById, setFailById] = useState<Record<string, string>>({});
  const textRef = useRef<HTMLTextAreaElement>(null);
  useFeedbackGithubSync(open);

  const path = location.pathname;
  const live = useMemo(
    () => (rows ?? []).filter((row) => row.deletedAt == null),
    [rows],
  );
  const onPage = useMemo(
    () =>
      live
        .filter((row) => row.pagePath === path)
        .sort((a, b) => (a.leftAt ?? 0) - (b.leftAt ?? 0)),
    [live, path],
  );
  const openOnPage = onPage.filter((row) => row.status === "open");
  const listed = (scope === "page" ? onPage : live)
    .filter((row) => showResolved || row.status === "open")
    .sort((a, b) => (b.leftAt ?? 0) - (a.leftAt ?? 0));
  const pinNumber = new Map(openOnPage.map((row, i) => [row._id, i + 1]));

  useLayoutTick(open || picking || draft != null);

  const stopPicking = useCallback(() => {
    setPicking(false);
    setHover(null);
  }, []);

  useEffect(() => {
    if (!picking && !draft) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      stopPicking();
      setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, draft, stopPicking]);

  useEffect(() => {
    if (draft) textRef.current?.focus();
  }, [draft]);

  // A new screen drops a half-written spot from the old one.
  useEffect(() => {
    setDraft(null);
    setPicking(false);
    setHover(null);
  }, [path]);

  const pick = (x: number, y: number) => {
    const element = elementAt(x, y);
    stopPicking();
    if (!element) return;
    const box = element.getBoundingClientRect();
    setDraft({
      x,
      y,
      targetLabel: describe(element),
      targetSelector: cssPath(element),
      offsetX: box.width > 0 ? (x - box.left) / box.width : 0.5,
      offsetY: box.height > 0 ? (y - box.top) / box.height : 0.5,
    });
    setKind("improvement");
    setText("");
  };

  const send = async () => {
    if (!draft || sending) return;
    const body = text.trim();
    if (!body) return;
    setSending(true);
    let docId: Id<"pageFeedbacks">;
    try {
      const created = (await create({
        pagePath: path,
        kind,
        body,
        pageTitle: pageTitle() || undefined,
        targetLabel: draft.targetLabel,
        targetSelector: draft.targetSelector,
        offsetX: draft.offsetX,
        offsetY: draft.offsetY,
        viewportWidth: Math.round(window.innerWidth),
      })) as { docId: Id<"pageFeedbacks"> };
      docId = created.docId;
    } catch (error) {
      reportActionFail(
        error instanceof Error ? error.message : "The comment was not saved.",
      );
      setSending(false);
      return;
    }
    setDraft(null);
    setText("");
    setSending(false);
    setOpen(true);
    await sendToClaude(docId);
  };

  const sendToClaude = async (id: Id<"pageFeedbacks">) => {
    setAddressingId(id);
    setFailById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const result = await fileIssue({ id });
      if ("issueUrl" in result) {
        if (result.started) {
          setWorkingIds((prev) => ({ ...prev, [id]: true }));
          reportActionOk("Claude is working on this.", [
            { label: "Open the GitHub issue", href: result.issueUrl },
          ]);
        } else {
          reportActionOk("Sent. Claude is not set up on this computer.", [
            { label: "Open the GitHub issue", href: result.issueUrl },
          ]);
        }
      } else if (result.skipped === "no-token") {
        setFailById((prev) => ({
          ...prev,
          [id]: "Could not send. This computer has no GitHub key.",
        }));
        reportActionFail(
          "This was not sent to Claude: the GitHub key is not set up on this server.",
        );
      } else {
        reportActionOk("The comment is saved in Capsule.");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Comment saved, but it was not sent to Claude. Try again.";
      setFailById((prev) => ({ ...prev, [id]: message }));
      reportActionFail(message);
    } finally {
      setAddressingId(null);
    }
  };

  const act = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run();
      reportActionOk(done);
    } catch (error) {
      reportActionFail(
        error instanceof Error
          ? error.message
          : "That did not work. Try again.",
      );
    }
  };

  const show = (row: Feedback) => {
    setFocusId(row._id);
    if (row.pagePath !== path) return;
    try {
      const element = row.targetSelector
        ? document.querySelector(row.targetSelector)
        : null;
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      // A stale path finds nothing; the list still shows the comment.
    }
  };

  const draftKeys = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    }
  };

  const popoverLeft = draft
    ? Math.max(12, Math.min(draft.x + 12, window.innerWidth - 332))
    : 0;
  const popoverTop = draft
    ? Math.max(12, Math.min(draft.y + 12, window.innerHeight - 260))
    : 0;

  return (
    <div {...{ [LAYER_ATTR]: "" }} className="print:hidden">
      {/* The tab on the right edge, below the event Report tab. */}
      {!open && !picking && !draft ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          className="fixed right-0 top-2/3 z-[9990] flex -translate-y-1/2 flex-col items-center gap-1 rounded-md border border-r-0 border-line bg-panel px-1.5 py-3 text-xs font-semibold text-ink shadow-md hover:bg-inset"
          aria-label={`Screen comments${openOnPage.length ? `, ${openOnPage.length} open here` : ""}`}
        >
          <span className="[writing-mode:vertical-rl]">Feedback</span>
          {openOnPage.length > 0 ? (
            <span className="rounded-full bg-accent px-1.5 text-xs text-on-brand">
              {openOnPage.length}
            </span>
          ) : null}
        </button>
      ) : null}

      {picking ? (
        <>
          <div
            className="fixed inset-0 z-[9995] cursor-crosshair"
            onMouseMove={(event) => {
              const element = elementAt(event.clientX, event.clientY);
              setHover(element ? element.getBoundingClientRect() : null);
            }}
            onClick={(event) => pick(event.clientX, event.clientY)}
          />
          {hover ? (
            <div
              className="pointer-events-none fixed z-[9994] rounded-xs border-2 border-accent bg-accent-soft/30"
              style={{
                left: hover.left,
                top: hover.top,
                width: hover.width,
                height: hover.height,
              }}
            />
          ) : null}
          <div className="fixed left-1/2 top-3 z-[9996] flex -translate-x-1/2 items-center gap-3 rounded-md bg-ink px-4 py-2 text-sm text-panel shadow-lg">
            Click the spot you want to comment on.
            <button
              type="button"
              className="rounded-sm border border-panel/40 px-2 py-0.5 text-xs"
              onClick={stopPicking}
            >
              Stop (Esc)
            </button>
          </div>
        </>
      ) : null}

      {open || picking || draft
        ? openOnPage.map((row) => {
            const point = pinPoint(row);
            if (!point) return null;
            return (
              <button
                key={row._id}
                type="button"
                onClick={() => {
                  setOpen(true);
                  setFocusId(row._id);
                }}
                className={`fixed z-[9993] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-panel text-xs font-semibold text-on-brand shadow-md ${focusId === row._id ? "bg-ink" : "bg-accent"}`}
                style={{ left: point.x, top: point.y }}
                aria-label={`Comment ${pinNumber.get(row._id)}: ${row.body}`}
                title={row.body}
              >
                {pinNumber.get(row._id)}
              </button>
            );
          })
        : null}

      {draft ? (
        <>
          <span
            className="fixed z-[9993] h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-ink shadow-md"
            style={{ left: draft.x, top: draft.y }}
          />
          <div
            role="dialog"
            aria-label="New screen comment"
            className="fixed z-[9997] w-80 rounded-md border border-line bg-panel p-3 text-sm text-ink shadow-lg"
            style={{ left: popoverLeft, top: popoverTop }}
          >
            <p className="mb-2 truncate text-xs text-ink-3">
              On {draft.targetLabel}
            </p>
            <div className="mb-2 flex flex-wrap gap-1">
              {KINDS.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setKind(choice.value)}
                  aria-pressed={kind === choice.value}
                  className={`rounded-full border px-2 py-0.5 text-xs ${kind === choice.value ? "border-accent bg-accent-soft text-accent-deep" : "border-line text-ink"}`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <textarea
              ref={textRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={draftKeys}
              rows={4}
              placeholder="What should change here?"
              className="w-full rounded-sm border border-line bg-panel p-2 text-sm text-ink"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-sm px-3 py-1 text-sm text-ink hover:bg-inset"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending || text.trim().length === 0}
                className="rounded-sm bg-accent px-3 py-1 text-sm font-semibold text-on-brand disabled:opacity-50"
                onClick={() => void send()}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {open && !picking && !draft ? (
        <aside
          aria-label="Screen comments"
          className="fixed bottom-0 right-0 top-0 z-[9992] flex w-full flex-col border-l border-line bg-panel text-sm text-ink shadow-lg sm:w-96"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-base font-semibold">Screen comments</h2>
            <button
              type="button"
              className="rounded-sm px-2 py-1 text-sm hover:bg-inset"
              onClick={() => {
                setOpen(false);
                setFocusId(null);
              }}
            >
              Close
            </button>
          </header>
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
            <button
              type="button"
              className="rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-on-brand"
              onClick={() => setPicking(true)}
            >
              Comment on a spot
            </button>
            <div className="flex items-center justify-between gap-2 text-xs">
              <div
                className="flex gap-1"
                role="group"
                aria-label="Which comments"
              >
                {(
                  [
                    ["page", "This screen"],
                    ["all", "All screens"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scope === value}
                    onClick={() => setScope(value)}
                    className={`rounded-full border px-2 py-0.5 ${scope === value ? "border-ink bg-ink text-panel" : "border-line"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(event) => setShowResolved(event.target.checked)}
                />
                Show resolved
              </label>
            </div>
          </div>
          <ol className="flex-1 overflow-y-auto">
            {rows === undefined ? (
              <li className="px-4 py-3 text-ink-3">Loading…</li>
            ) : listed.length === 0 ? (
              <li className="px-4 py-3 text-ink-3">
                {scope === "page"
                  ? "No comments on this screen yet."
                  : "No comments yet."}
              </li>
            ) : (
              listed.map((row) => {
                const here = row.pagePath === path;
                const number = pinNumber.get(row._id);
                const offScreen =
                  here && row.status === "open" && !pinPoint(row);
                return (
                  <ReviewerToolbarCommentRow
                    key={row._id}
                    row={row}
                    here={here}
                    focused={focusId === row._id}
                    number={number}
                    offScreen={offScreen}
                    addressing={addressingId === row._id}
                    working={
                      row.status === "open" && workingIds[row._id] === true
                    }
                    fail={failById[row._id]}
                    onShow={() => show(row)}
                    onAddress={() => void sendToClaude(row._id)}
                    onResolve={() =>
                      void act(
                        () =>
                          resolve({
                            docId: row._id,
                            version: row.version,
                          }),
                        "Comment resolved.",
                      )
                    }
                    onReopen={() =>
                      void act(
                        () =>
                          reopen({
                            docId: row._id,
                            version: row.version,
                          }),
                        "Comment opened again.",
                      )
                    }
                    onRemove={() =>
                      void act(
                        () => remove({ docId: row._id, version: row.version }),
                        "Comment removed.",
                      )
                    }
                  />
                );
              })
            )}
          </ol>
        </aside>
      ) : null}
    </div>
  );
}
