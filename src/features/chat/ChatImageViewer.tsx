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

  // The body scroll lock is applied on mount and released on unmount only —
  // never re-applied when the image set changes, so it cannot linger after the
  // last image is gone (see the close-when-empty effect below).
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // If the message's images disappear while the viewer is open (a removal
  // arriving over the live query), close it so the lock is released and the
  // page is usable again.
  useEffect(() => {
    if (images.length === 0) onClose();
  }, [images.length, onClose]);

  useEffect(() => {
    closeRef.current?.focus();
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
