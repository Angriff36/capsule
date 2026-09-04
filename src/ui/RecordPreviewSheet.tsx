import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { XIcon } from "./icons";
import "./RecordPreviewSheet.css";

type Props = Readonly<{
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}>;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible desktop-right / mobile-bottom record inspector. */
export function RecordPreviewSheet({
  open,
  title,
  description,
  label = "Record preview",
  onClose,
  children,
  footer,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const priorFocus = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // A nested lifecycle prompt owns the first Escape press. Its own
        // keyboard handler dismisses it without also losing this record.
        if (panelRef.current?.querySelector("[data-action-prompt]")) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      trapTabKey(event, panelRef);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = priorOverflow;
      priorFocus?.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="record-preview-backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !panelRef.current?.querySelector("[data-action-prompt]")
        ) {
          onClose();
        }
      }}
    >
      <section
        ref={panelRef}
        className="record-preview-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="record-preview-header">
          <div className="record-preview-heading">
            <p>{label}</p>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="record-preview-close"
            aria-label="Close preview"
            onClick={onClose}
          >
            <XIcon />
          </button>
        </header>
        <div className="record-preview-body">{children}</div>
        {footer ? (
          <footer className="record-preview-footer">{footer}</footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}

function trapTabKey(event: KeyboardEvent, panelRef: RefObject<HTMLElement>) {
  const panel = panelRef.current;
  if (!panel) return;
  const focusable = Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE),
  ).filter((node) => node.offsetParent !== null);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
