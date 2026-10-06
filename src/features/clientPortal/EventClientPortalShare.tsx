import { useAction } from "convex/react";
import { useState } from "react";
import type { Id } from "../../lib/api";
import { api } from "../../lib/api";
import { copyText } from "../../lib/copyText";
import { useActionPrompt } from "../../ui/action-prompt";

type ShareState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "ready"; url: string; copied: boolean }
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
      // The new link already replaced the old one: when the browser will not
      // copy, show it to copy by hand instead of losing it behind an error.
      const copied = await copyText(url);
      setState({ kind: "ready", url, copied });
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
      setOffState({ kind: "ready", url: "", copied: false });
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
    <div className="action-menu-group" key="client-portal-share" data-keep-open>
      {host}
      <button
        type="button"
        className="btn btn-ghost"
        disabled={state.kind === "working"}
        onClick={() => void copyPortalLink()}
      >
        {state.kind === "working"
          ? "Preparing link…"
          : state.kind === "ready" && state.copied
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
      {state.kind === "ready" && !state.copied ? (
        <span className="max-w-64 text-xs text-ink-2">
          This browser would not copy. Select the link and copy it:{" "}
          <span className="select-all break-all font-medium text-ink">
            {state.url}
          </span>
        </span>
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
        {state.kind === "ready"
          ? state.copied
            ? "Client portal link copied."
            : "Client portal link ready to copy."
          : ""}
      </span>
    </div>
  );
}
