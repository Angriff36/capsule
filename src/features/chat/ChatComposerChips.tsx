import { useEffect, useState } from "react";
import { FileTextIcon, XIcon } from "../../ui/icons";
import { formatFileSize } from "./ChatAttachmentList";
import { AtSignIcon, chatKindIcon } from "./chatIcons";

/** A file waiting in the composer; `key` keeps chips stable while others are removed. */
export type ChatPendingFile = { readonly key: string; readonly file: File };

type LinkChip = {
  readonly kind: string;
  readonly id: string;
  readonly label: string;
};
type MentionChip = { readonly personId: string; readonly name: string };

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-line-2 hover:text-ink"
      aria-label={label}
      onClick={onClick}
    >
      <XIcon width={11} height={11} />
    </button>
  );
}

/** "Linked" row: mention and record chips the next message will carry. */
export function ChatLinkedRow({
  links,
  mentions,
  onRemoveLink,
  onRemoveMention,
}: {
  links: readonly LinkChip[];
  mentions: readonly MentionChip[];
  onRemoveLink: (link: LinkChip) => void;
  onRemoveMention: (personId: string) => void;
}) {
  if (links.length === 0 && mentions.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="eyebrow">Linked</span>
      {mentions.map((mention) => (
        <span
          key={mention.personId}
          className="chip-meta max-w-full gap-1.5 pr-1.5"
        >
          <AtSignIcon width={13} height={13} className="shrink-0 text-ink-3" />
          <span className="truncate">{mention.name}</span>
          <RemoveButton
            label={`Remove link ${mention.name}`}
            onClick={() => onRemoveMention(mention.personId)}
          />
        </span>
      ))}
      {links.map((link) => {
        const Icon = chatKindIcon(link.kind);
        return (
          <span
            key={`${link.kind}:${link.id}`}
            className="chip-meta max-w-full gap-1.5 pr-1.5"
          >
            <Icon width={13} height={13} className="shrink-0 text-ink-3" />
            <span className="truncate">{link.label}</span>
            <RemoveButton
              label={`Remove link ${link.label}`}
              onClick={() => onRemoveLink(link)}
            />
          </span>
        );
      })}
    </div>
  );
}

/** Object URL for an image file, revoked when the chip unmounts or the file changes. */
function useImagePreview(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const previewUrl = useImagePreview(file);
  return (
    <li className="flex max-w-full items-center gap-2 rounded-sm border border-line bg-panel py-1 pr-1 pl-1.5">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-xs border border-line object-cover"
        />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xs bg-inset text-ink-2">
          <FileTextIcon width={16} height={16} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block max-w-48 truncate text-base text-ink">
          {file.name}
        </span>
        <span className="block text-xs text-ink-3">
          {formatFileSize(file.size)}
        </span>
      </span>
      <RemoveButton label={`Remove file ${file.name}`} onClick={onRemove} />
    </li>
  );
}

/** Files waiting to go with the next message. */
export function ChatFileChips({
  files,
  onRemove,
}: {
  files: readonly ChatPendingFile[];
  onRemove: (key: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label="Files to send">
      {files.map(({ key, file }) => (
        <FileChip key={key} file={file} onRemove={() => onRemove(key)} />
      ))}
    </ul>
  );
}
