import { useAction } from "convex/react";
import { useState } from "react";
import type { Id } from "../../lib/api";
import { api } from "../../lib/api";
import { useActionPrompt } from "../../ui/action-prompt";

type ShareState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

export function EventClientPortalShare({ eventId }: { eventId: Id<"events"> }) {
  const createShareToken = useAction(api.clientPortal.createShareToken);
  const turnOffShare = useAction(api.clientPortal.turnOffShare);
  const { prompt, host } = useActionPrompt();
  const [state, setState] = useState<ShareState>({ kind: "idle" });
  const [offState, setOffState] = useState<ShareState>({ kind: "idle" });

  const copyPortalLink = async () => {
    setState({ kind: "working" });
    try {
      const token = await createShareToken({ eventId });
      const url = new URL(
        `/portal/events/${encodeURIComponent(token)}`,
        window.location.origin,
      ).toString();
      await copyText(url);
      setState({ kind: "ready", url });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The client link could not be copied.",
      });
    }
  };

  const turnOffPortalLink = async () => {
    const ok = await prompt.askConfirm({
      title: "Turn off the client link",
      description:
        "The client will no longer be able to open the current link. You can copy a new one anytime.",
      confirmLabel: "Turn off link",
      tone: "danger",
    });
    if (!ok) return;
    setOffState({ kind: "working" });
    try {
      await turnOffShare({ eventId });
      setOffState({ kind: "ready", url: "" });
      if (state.kind === "ready") setState({ kind: "idle" });
    } catch (error) {
      setOffState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The client link could not be turned off.",
      });
    }
  };

  return (
    <div
      className="flex items-center gap-2"
      key="client-portal-share"
      data-keep-open
    >
      {host}
      <button
        type="button"
        className="btn btn-ghost"
        disabled={state.kind === "working"}
        onClick={() => void copyPortalLink()}
      >
        {state.kind === "working"
          ? "Preparing link…"
          : state.kind === "ready"
            ? "Client link copied"
            : "Copy client portal"}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={offState.kind === "working"}
        onClick={() => void turnOffPortalLink()}
      >
        {offState.kind === "working"
          ? "Turning off…"
          : offState.kind === "ready"
            ? "Client link off"
            : "Turn off client link"}
      </button>
      {state.kind === "ready" ? (
        <a
          className="text-xs font-medium text-brand underline underline-offset-2"
          href={state.url}
          target="_blank"
          rel="noreferrer"
        >
          Preview
        </a>
      ) : null}
      {state.kind === "ready" ? (
        <span className="max-w-64 text-xs text-ink-3">
          Works for 90 days. Copying again turns the previous link off.
        </span>
      ) : null}
      {state.kind === "error" ? (
        <span className="max-w-52 text-xs text-danger" role="alert">
          {state.message}
        </span>
      ) : null}
      {offState.kind === "error" ? (
        <span className="max-w-52 text-xs text-danger" role="alert">
          {offState.message}
        </span>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {state.kind === "ready" ? "Client portal link copied." : ""}
      </span>
    </div>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied)
    throw new Error("Copy failed. Open Preview and copy the address.");
}
