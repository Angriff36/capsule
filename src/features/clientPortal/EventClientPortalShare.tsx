import { useAction } from "convex/react";
import { useState } from "react";
import type { Id } from "../../lib/api";
import { api } from "../../lib/api";
import { copyText } from "../../lib/copyText";
import { useActionPrompt } from "../../ui/action-prompt";
import { DropdownMenuItem } from "../../ui/DropdownMenu";

type ShareState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "ready"; url: string; copied: boolean }
  | { kind: "error"; message: string };

/**
 * Client-portal link actions for a DropdownMenu. The state and the confirm
 * prompt host live in the caller (outside the menu content), so the prompt
 * survives the menu closing; render `menuItems` inside the menu and `host`
 * anywhere outside it.
 */
export function useEventClientPortalShare(eventId: Id<"events">) {
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

  const menuItems = (
    <>
      <DropdownMenuItem
        disabled={state.kind === "working"}
        onSelect={(event) => {
          // The result (copied, or the link to copy by hand) shows in place.
          event.preventDefault();
          void copyPortalLink();
        }}
      >
        {state.kind === "working"
          ? "Preparing link…"
          : state.kind === "ready" && state.copied
            ? "Client link copied"
            : "Copy client portal"}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={offState.kind === "working"}
        onSelect={() => void turnOffPortalLink()}
      >
        {offState.kind === "working"
          ? "Turning off…"
          : offState.kind === "ready"
            ? "Client link off"
            : "Turn off client link"}
      </DropdownMenuItem>
      {state.kind === "ready" ? (
        <DropdownMenuItem asChild>
          <a href={state.url} target="_blank" rel="noreferrer">
            Preview
          </a>
        </DropdownMenuItem>
      ) : null}
      {state.kind === "ready" && !state.copied ? (
        <div className="max-w-64 px-3 py-1 text-xs text-ink-2">
          This browser would not copy. Select the link and copy it:{" "}
          <span className="select-all break-all font-medium text-ink">
            {state.url}
          </span>
        </div>
      ) : null}
      {state.kind === "ready" ? (
        <div className="max-w-64 px-3 py-1 text-xs text-ink-3">
          Works for 90 days. Copying again turns the previous link off.
        </div>
      ) : null}
      {state.kind === "error" ? (
        <div className="max-w-52 px-3 py-1 text-xs text-danger" role="alert">
          {state.message}
        </div>
      ) : null}
      {offState.kind === "error" ? (
        <div className="max-w-52 px-3 py-1 text-xs text-danger" role="alert">
          {offState.message}
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {state.kind === "ready"
          ? state.copied
            ? "Client portal link copied."
            : "Client portal link ready to copy."
          : ""}
      </span>
    </>
  );

  return { host, menuItems };
}
