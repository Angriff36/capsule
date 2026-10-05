import { useState } from "react";
import type { Id } from "../../../lib/api";
import {
  useEventLinkExternalChannel,
  useEventUnlinkExternalChannel,
  useGetEvent,
} from "../../../lib/manifest-convex-react";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";

/**
 * Record the event's channel in the outside team chat (Slack), named
 * event-number-event-name. The Final Lock team chat answer checks it.
 */
export function OutsideChannelForm({
  eventId,
  suggestedName,
}: {
  eventId: Id<"events">;
  suggestedName: string | null;
}) {
  const event = useGetEvent(eventId) as
    | {
        version: number;
        externalChannelName?: string | null;
        externalChannelId?: string | null;
        externalChannelUrl?: string | null;
      }
    | null
    | undefined;
  const link = useEventLinkExternalChannel();
  const unlink = useEventUnlinkExternalChannel();
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  if (!event) return null;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
      setName("");
      setChannelId("");
      setUrl("");
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-ink-2">
        {event.externalChannelId
          ? `Outside chat channel: ${event.externalChannelName}`
          : "Record the outside chat channel"}
      </summary>
      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}
      {event.externalChannelUrl && (
        <p className="mt-2">
          <a
            className="btn-link"
            href={event.externalChannelUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open the channel
          </a>
        </p>
      )}
      <form
        className="mt-2 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            link({
              docId: eventId,
              version: event.version,
              channelName: name || suggestedName || "",
              channelId,
              ...(url.trim() ? { channelUrl: url } : {}),
            }),
          );
        }}
      >
        <label className="block">
          Channel name
          <input
            className="input mt-1 block w-full"
            placeholder={suggestedName ?? "Give the event its number first"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          Channel id
          <input
            className="input mt-1 block w-full"
            required
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          />
        </label>
        <label className="block">
          Channel link (optional)
          <input
            className="input mt-1 block w-full"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" disabled={busy}>
            {busy ? "Saving…" : "Save channel"}
          </button>
          {event.externalChannelId && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  unlink({ docId: eventId, version: event.version }),
                )
              }
            >
              Remove channel
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
