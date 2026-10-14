import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { trapTab } from "./action-prompt/dialogFocus";
import { XIcon } from "./icons";
import "./ui-layouts.css";

const PHONE = "(max-width: 767px)";

function usePhone() {
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia(PHONE).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(PHONE);
    const onChange = () => setPhone(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return phone;
}

/**
 * A modal window, adapted from ui-layouts "Dialog" and "Responsive Modal"
 * (MIT, see ui-layouts.LICENSE.txt). On a computer it fades and rises in the
 * middle of the screen; on a phone it slides up from the bottom as a sheet.
 * Focus moves in, Tab stays inside, Esc and a click on the dim backdrop close
 * it, and focus goes back to the control that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons along the bottom edge, right-aligned. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** False while a save is running: Esc and the backdrop then do nothing. */
  dismissible?: boolean;
}) {
  const phone = usePhone();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      (
        panel?.querySelector<HTMLElement>(
          "[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
        ) ?? panel
      )?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      returnFocus.current?.focus();
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (dismissible) onClose();
    } else if (event.key === "Tab" && panelRef.current) {
      trapTab(event, panelRef.current);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="backdrop"
            className="ui-dialog-backdrop"
            data-phone={phone || undefined}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && dismissible)
                onClose();
            }}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descriptionId : undefined}
              tabIndex={-1}
              onKeyDown={onKeyDown}
              className={`ui-dialog ui-dialog-${size}`}
              initial={
                phone ? { y: "100%" } : { opacity: 0, y: 12, scale: 0.98 }
              }
              animate={phone ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
              exit={phone ? { y: "100%" } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", bounce: 0, duration: 0.32 }}
            >
              {phone ? (
                <div className="ui-dialog-grip" aria-hidden="true" />
              ) : null}
              <header className="ui-dialog-head">
                <div className="min-w-0">
                  <h2 id={titleId} className="ui-dialog-title">
                    {title}
                  </h2>
                  {description ? (
                    <p id={descriptionId} className="ui-dialog-description">
                      {description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="ui-dialog-close"
                  aria-label="Close"
                  disabled={!dismissible}
                  onClick={onClose}
                >
                  <XIcon width={16} height={16} />
                </button>
              </header>
              {children ? (
                <div className="ui-dialog-body">{children}</div>
              ) : null}
              {footer ? (
                <footer className="ui-dialog-foot">{footer}</footer>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  );
}
