import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal sheet in the dashboard's paper style. The dialog stays in the
 * `.evd` subtree, so the dashboard tokens reach it in the top layer.
 */
export function EventDashSheet({
  open,
  label,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly label: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // jsdom has no showModal; the open attribute is enough there.
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      dialog.querySelector(".evd-sheet")?.scrollTo?.(0, 0);
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="evd-dialog"
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="evd-sheet">
        <button
          type="button"
          className="evd-sheet-x"
          aria-label="Close"
          onClick={onClose}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        {open ? children : null}
      </div>
    </dialog>
  );
}

export function EventDashSheetHead({
  kicker,
  title,
  lede,
}: {
  readonly kicker: string;
  readonly title: ReactNode;
  readonly lede?: ReactNode;
}) {
  return (
    <div className="evd-v-head">
      <span className="evd-label">{kicker}</span>
      <h2>{title}</h2>
      {lede ? <p>{lede}</p> : null}
    </div>
  );
}
