import { useAction } from "convex/react";
import { useState } from "react";
import type { Id } from "../../lib/api";
import { api } from "../../lib/api";

type ShareState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

export function EventClientPortalShare({ eventId }: { eventId: Id<"events"> }) {
  const createShareToken = useAction(api.clientPortal.createShareToken);
  const [state, setState] = useState<ShareState>({ kind: "idle" });

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

  return (
    <div
      className="flex items-center gap-2"
      key="client-portal-share"
      data-keep-open
    >
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
      {state.kind === "error" ? (
        <span className="max-w-52 text-xs text-danger" role="alert">
          {state.message}
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
