import { useCallback, useRef, useState } from "react";
import { useVoiceRecorder, type VoiceTake } from "./useVoiceRecorder";
import "./chat.css";

type Props = {
  /** Uploads and sends the take as a message attachment. Rejects on failure. */
  readonly onSend: (take: VoiceTake) => Promise<void>;
  readonly disabled?: boolean;
};

/**
 * Walkie-talkie: press and HOLD the mic to talk, release to send. The take
 * goes to the open channel as a voice attachment — no typing, no Send button.
 * Pull the pointer off the button and let go to cancel instead.
 */
export function ChatWalkieBar({ onSend, disabled = false }: Props) {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const pointerRef = useRef<{ id: number; inside: boolean } | null>(null);

  const handleTake = useCallback(
    async (take: VoiceTake) => {
      if (take.durationMs < 500) {
        // A tap isn't a transmission; require a real hold so the channel
        // doesn't fill with accidental blips.
        setSendError("Hold the button while you talk.");
        return;
      }
      setSending(true);
      setSendError(null);
      try {
        await onSend(take);
      } catch {
        setSendError("Didn't send. Check your connection and try again.");
      } finally {
        setSending(false);
      }
    },
    [onSend],
  );

  const recorder = useVoiceRecorder(handleTake);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || sending || recorder.recording) return;
    event.preventDefault();
    // Capture so release/cancel keeps firing even if the pointer leaves.
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, inside: true };
    void recorder.begin();
  };

  const onPointerEnter = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.id === event.pointerId) {
      pointerRef.current.inside = true;
    }
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.id === event.pointerId) {
      pointerRef.current.inside = false;
    }
  };

  const finish = (event: React.PointerEvent<HTMLButtonElement>) => {
    const held = pointerRef.current;
    if (!held || held.id !== event.pointerId) return;
    pointerRef.current = null;
    // Off the button on release = thrown away, like every PTT app.
    if (held.inside) {
      recorder.end();
    } else {
      recorder.cancel();
    }
  };

  if (!recorder.supported) return null;

  return (
    <div className="chat-walkie" data-testid="walkie-bar">
      {recorder.recording ? (
        <button
          type="button"
          className="btn btn-sm chat-walkie-cancel"
          onClick={() => {
            pointerRef.current = null;
            recorder.cancel();
          }}
        >
          Cancel
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-primary chat-walkie-mic"
        data-recording={recorder.recording ? "true" : "false"}
        data-sending={sending ? "true" : "false"}
        disabled={disabled || sending}
        aria-label={
          recorder.recording
            ? "Release to send, slide off to cancel"
            : "Hold to talk"
        }
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerUp={finish}
        onPointerCancel={(event) => {
          pointerRef.current = null;
          recorder.cancel();
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {recorder.recording ? (
          <span className="chat-walkie-live">
            <span className="chat-walkie-dot" aria-hidden="true" />
            {formatElapsed(recorder.elapsedMs)} — release to send
          </span>
        ) : sending ? (
          "Sending…"
        ) : (
          <span className="chat-walkie-label">
            <MicGlyph />
            Hold to talk
          </span>
        )}
      </button>
      {sendError ? (
        <p role="status" className="chat-walkie-error">
          {sendError}
        </p>
      ) : null}
      {recorder.error ? (
        <p role="alert" className="chat-walkie-error">
          {recorder.error}
          <button
            type="button"
            className="ml-2 text-link"
            onClick={recorder.clearError}
          >
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function MicGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
