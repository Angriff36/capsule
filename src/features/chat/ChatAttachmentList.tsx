import { useEffect, useRef, useState } from "react";
import { FileTextIcon } from "../../ui/icons";
import { ChatImageViewer, type ChatViewerImage } from "./ChatImageViewer";
import { formatFileSize } from "./chatFileSize";
import type { ChatAttachmentView } from "./chatTypes";
import "./chat.css";

export { formatFileSize } from "./chatFileSize";

function isImage(
  attachment: ChatAttachmentView,
): attachment is ChatViewerImage {
  return attachment.contentType.startsWith("image/") && attachment.url !== null;
}

function isAudio(attachment: ChatAttachmentView): boolean {
  return attachment.contentType.startsWith("audio/");
}

function audioDurationLabel(attachment: ChatAttachmentView): string | null {
  const match = /Voice message \((\d+)s\)/.exec(attachment.fileName);
  if (!match) return null;
  const totalSeconds = Number(match[1]);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Inline player for a voice message — plays inside the app, never a tab. */
function ChatVoiceMessage({ attachment }: { attachment: ChatAttachmentView }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  // Leaving the thread must silence the clip; the element unmounts but a
  // backgrounded audio element can keep playing until GC.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  return (
    <div
      className="chat-voice"
      data-playing={playing ? "true" : "false"}
      data-testid="chat-voice-message"
    >
      <button
        type="button"
        className="chat-voice-toggle"
        aria-label={
          playing
            ? `Pause ${attachment.fileName}`
            : `Play ${attachment.fileName}`
        }
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) {
            audio.play().catch(() => setPlaying(false));
          } else {
            audio.pause();
          }
        }}
      >
        {playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <div className="chat-voice-body">
        <p className="chat-voice-title">Voice message</p>
        <p className="chat-voice-meta">
          {audioDurationLabel(attachment) ??
            formatFileSize(attachment.fileSize)}
        </p>
      </div>
      <audio
        ref={audioRef}
        src={attachment.url ?? undefined}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => undefined}
      />
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.9l11-6.86a1.05 1.05 0 0 0 0-1.8l-11-6.86c-.7-.4-1.56.1-1.56.9Z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

/**
 * Photos first — shown in the thread, a tap opens them full screen inside
 * the app (never a raw download tab) — then other files as ruled rows.
 */
export function ChatAttachmentList({
  attachments,
  onImageLoad,
}: {
  attachments: readonly ChatAttachmentView[];
  onImageLoad?: () => void;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (attachments.length === 0) return null;
  const images = attachments.filter(isImage);
  const audios = attachments.filter(
    (attachment) => isAudio(attachment) && !isImage(attachment),
  );
  const files = attachments.filter(
    (attachment) => !isImage(attachment) && !isAudio(attachment),
  );
  return (
    <div className="mt-1.5 space-y-1.5">
      {audios.length > 0 ? (
        <div className="space-y-1.5">
          {audios.map((audio) => (
            <ChatVoiceMessage key={audio._id} attachment={audio} />
          ))}
        </div>
      ) : null}
      {images.length > 0 ? (
        <div
          className="chat-photos"
          data-count={images.length === 1 ? "one" : "many"}
        >
          {images.map((image, position) => (
            <button
              key={image._id}
              type="button"
              className="chat-photo"
              aria-label={`Open photo ${image.fileName}`}
              onClick={() => setViewerIndex(position)}
            >
              <img
                src={image.url}
                alt={image.fileName}
                loading="lazy"
                onLoad={onImageLoad}
              />
            </button>
          ))}
        </div>
      ) : null}
      {viewerIndex !== null ? (
        <ChatImageViewer
          images={images}
          index={Math.min(viewerIndex, images.length - 1)}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
      {files.length > 0 ? (
        <ul className="divide-y divide-line-2">
          {files.map((file) => (
            <li
              key={file._id}
              className="flex items-center gap-2 py-1.5 text-base"
            >
              <FileTextIcon
                width={14}
                height={14}
                className="shrink-0 text-ink-3"
              />
              {file.url ? (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-brand hover:underline"
                >
                  {file.fileName}
                </a>
              ) : (
                <span className="min-w-0 truncate text-ink">
                  {file.fileName}
                </span>
              )}
              <span className="shrink-0 text-xs text-ink-3">
                {formatFileSize(file.fileSize)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
