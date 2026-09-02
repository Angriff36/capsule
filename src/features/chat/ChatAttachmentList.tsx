import { useState } from "react";
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
  const files = attachments.filter((attachment) => !isImage(attachment));
  return (
    <div className="mt-1.5 space-y-1.5">
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
