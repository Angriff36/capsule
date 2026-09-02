import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatFileSize } from "./chatFileSize";
import type { ChatAttachmentView } from "./chatTypes";
import "./chat.css";

export type ChatViewerImage = ChatAttachmentView & { readonly url: string };

type Props = {
  readonly images: readonly ChatViewerImage[];
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
};

/**
 * Full-screen viewer for a message's photos: the image at its natural fit,
 * previous/next across the message's images (arrow keys too), Esc or the
 * scrim closes. Nothing leaves the app; "Open original" is there for the
 * few who want the raw file.
 */
export function ChatImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const image = images[index];
  const many = images.length > 1;

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" && many) {
        onIndexChange((index + 1) % images.length);
      } else if (event.key === "ArrowLeft" && many) {
        onIndexChange((index - 1 + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [images.length, index, many, onClose, onIndexChange]);

  if (!image) return null;

  // Portal: the chat pane's ancestors form a containing block for fixed
  // elements, so the viewer must live directly under <body> to fill the
  // viewport.
  return createPortal(
    <div
      className="chat-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${images.length}: ${image.fileName}`}
      onClick={onClose}
    >
      <div className="chat-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base text-on-brand">{image.fileName}</p>
          <p className="text-xs text-on-brand">
            {formatFileSize(image.fileSize)}
            {many ? ` · ${index + 1} of ${images.length}` : ""}
          </p>
        </div>
        <a
          className="btn btn-ghost btn-sm chat-lightbox-btn"
          href={image.url}
          target="_blank"
          rel="noreferrer"
        >
          Open original
        </a>
        <button
          ref={closeRef}
          type="button"
          className="btn btn-ghost btn-sm chat-lightbox-btn"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <img
        className="chat-lightbox-img"
        src={image.url}
        alt={image.fileName}
        onClick={(e) => e.stopPropagation()}
      />
      {many ? (
        <>
          <button
            type="button"
            className="chat-lightbox-nav chat-lightbox-prev"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index - 1 + images.length) % images.length);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="chat-lightbox-nav chat-lightbox-next"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index + 1) % images.length);
            }}
          >
            ›
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
