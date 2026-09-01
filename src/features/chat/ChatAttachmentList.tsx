import { FileTextIcon } from "../../ui/icons";
import type { ChatAttachmentView } from "./chatTypes";

/** B / KB / MB / GB; one decimal above KB. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

type ImageAttachment = ChatAttachmentView & { readonly url: string };

function isImage(
  attachment: ChatAttachmentView,
): attachment is ImageAttachment {
  return attachment.contentType.startsWith("image/") && attachment.url !== null;
}

/** Images first as a thumbnail gallery, then other files as ruled rows. */
export function ChatAttachmentList({
  attachments,
  onImageLoad,
}: {
  attachments: readonly ChatAttachmentView[];
  onImageLoad?: () => void;
}) {
  if (attachments.length === 0) return null;
  const images = attachments.filter(isImage);
  const files = attachments.filter((attachment) => !isImage(attachment));
  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((image) => (
            <a
              key={image._id}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="block max-w-full"
            >
              <img
                src={image.url}
                alt={image.fileName}
                onLoad={onImageLoad}
                className="max-h-60 max-w-full rounded-sm border border-line object-contain"
              />
            </a>
          ))}
        </div>
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
