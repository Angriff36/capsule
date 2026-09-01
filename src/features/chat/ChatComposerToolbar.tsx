import { useRef } from "react";
import { LinkIcon, PaperclipIcon } from "./chatIcons";

type Props = {
  readonly onAttach: (files: FileList | null) => void;
  readonly toolbarOpen: boolean;
  readonly pickerId: string;
  readonly onToggleToolbar: () => void;
  readonly canSend: boolean;
  readonly sending: boolean;
};

/** Attach · Link a record · Send — the composer's bottom row. */
export function ChatComposerToolbar({
  onAttach,
  toolbarOpen,
  pickerId,
  onToggleToolbar,
  canSend,
  sending,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onAttach(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => fileInputRef.current?.click()}
      >
        <PaperclipIcon width={14} height={14} />
        Attach
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-expanded={toolbarOpen}
        aria-controls={toolbarOpen ? pickerId : undefined}
        onClick={onToggleToolbar}
      >
        <LinkIcon width={14} height={14} />
        Link a record
      </button>
      <button
        type="submit"
        className="btn btn-primary ml-auto"
        disabled={!canSend}
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
