import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ActionPromptRequest } from "./ActionPromptTypes";
import { ActionPromptFields } from "./ActionPromptFields";
import {
  ACTION_PROMPT_CONFIRM_ARM_MS,
  shouldAcceptConfirmClick,
} from "./confirmClickArm";
import {
  closeModal,
  initialFocusTarget,
  openModal,
  trapTab,
} from "./dialogFocus";
import { AlertTriangleIcon, CheckCircleIcon, FileTextIcon } from "../icons";
import "./ActionPromptPanel.css";

interface ActionPromptPanelProps {
  request: ActionPromptRequest;
  busy?: boolean;
  onDismiss: () => void;
  onConfirm: (payload: {
    reason?: string;
    values?: Record<string, string>;
  }) => void;
}

/**
 * Alert dialog for the governed-command confirm / reason step (Origin UI
 * Alert Dialog pattern on a native modal <dialog>). The host stays inline at
 * the call site so the DOM (and `[data-action-prompt]` lookups) are
 * unchanged; showModal() lifts it into the top layer with a scrim.
 */
export function ActionPromptPanel({
  request,
  busy = false,
  onDismiss,
  onConfirm,
}: ActionPromptPanelProps) {
  const headingId = useId();
  const helperId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPressRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(request),
  );

  const tone = request.tone ?? "default";
  const cancelLabel = request.cancelLabel ?? "Keep as-is";

  const [confirmArmed, setConfirmArmed] = useState(request.kind !== "confirm");

  useEffect(() => {
    if (request.kind !== "confirm") return;
    setConfirmArmed(false);
    const id = window.setTimeout(() => {
      setConfirmArmed(true);
    }, ACTION_PROMPT_CONFIRM_ARM_MS);
    return () => window.clearTimeout(id);
    // Keyed to the request object itself: replacing an open confirm with
    // another (same title or not) re-arms the delay, so a click aimed at the
    // first prompt can never land on the second one's destructive button.
  }, [request]);

  const latest = useRef({ busy, onDismiss });
  latest.current = { busy, onDismiss };

  // Open modally on mount, move focus inside, and restore it on close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    openModal(dialog);
    initialFocusTarget(dialog)?.focus();
    // The native Esc path fires `cancel`; this component owns dismissal.
    const onNativeCancel = (event: Event) => event.preventDefault();
    // A close we did not ask for (browser close-watcher) must not strand the
    // pending prompt: dismiss it, or reopen while a submit is in flight.
    let unmounting = false;
    const onNativeClose = () => {
      if (unmounting) return;
      if (latest.current.busy) openModal(dialog);
      else latest.current.onDismiss();
    };
    dialog.addEventListener("cancel", onNativeCancel);
    dialog.addEventListener("close", onNativeClose);
    return () => {
      unmounting = true;
      dialog.removeEventListener("cancel", onNativeCancel);
      dialog.removeEventListener("close", onNativeClose);
      closeModal(dialog);
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, []);

  // Esc outside the dialog (fallback, non-modal environments) still cancels.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!busy) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onDismiss]);

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      // Own the press: an enclosing sheet or page editor must not also close.
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onDismiss();
      return;
    }
    if (event.key === "Tab" && dialogRef.current) {
      event.stopPropagation();
      trapTab(event, dialogRef.current);
    }
  };

  // Clicks on ::backdrop target the <dialog> itself; the form fills the box.
  const onDialogMouseDown = (event: ReactMouseEvent<HTMLDialogElement>) => {
    backdropPressRef.current = event.target === event.currentTarget;
  };
  const onDialogClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return;
    event.stopPropagation();
    const pressedBackdrop = backdropPressRef.current;
    backdropPressRef.current = false;
    if (pressedBackdrop && !busy) onDismiss();
  };

  const rejectUnarmedConfirm = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    if (shouldAcceptConfirmClick({ kind: request.kind, armed: confirmArmed })) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Confirm-kind is click-only. Form submit / Enter / a Keep as-is button
    // that lost type="button" must not confirm a destructive remove.
    if (request.kind === "confirm") {
      return;
    }
    if (request.kind === "reason") {
      const trimmed = reason.trim();
      if (!trimmed) return;
      onConfirm({ reason: trimmed });
      return;
    }
    const next: Record<string, string> = {};
    for (const field of request.fields) {
      const value = (values[field.name] ?? "").trim();
      if ((field.required ?? true) && !value) return;
      next[field.name] = value;
    }
    onConfirm({ values: next });
  };

  const cancel = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  };

  const confirmClass =
    tone === "danger"
      ? "btn justify-center border-danger bg-danger text-white hover:-translate-y-px hover:bg-danger/90 dark:text-canvas"
      : "btn btn-primary justify-center";
  const Icon =
    tone === "danger"
      ? AlertTriangleIcon
      : request.kind === "confirm"
        ? CheckCircleIcon
        : FileTextIcon;

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={helperId}
      aria-busy={busy || undefined}
      data-tone={tone}
      className="action-prompt-dialog m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[32rem] overflow-y-auto rounded-ledger border border-line bg-panel p-0 text-ink shadow-[0_24px_60px_-24px_rgb(15_15_17/0.45),0_2px_6px_-2px_rgb(15_15_17/0.12)]"
      onKeyDown={onDialogKeyDown}
      onMouseDown={onDialogMouseDown}
      onClick={onDialogClick}
    >
      <form
        data-action-prompt
        className="grid gap-5 p-6"
        aria-labelledby={headingId}
        onSubmit={submit}
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div
            className={`flex size-[36px] shrink-0 items-center justify-center rounded-full border border-line ${
              tone === "danger" ? "text-danger" : "text-ink-2"
            }`}
            aria-hidden="true"
          >
            <Icon width={16} height={16} />
          </div>
          <div className="grid gap-1.5 text-center sm:pt-1 sm:text-left">
            <h2 id={headingId} className="text-lg font-semibold text-ink">
              {request.title}
            </h2>
            <p id={helperId} className="text-base text-ink-2">
              {request.description}
            </p>
          </div>
        </div>

        {request.kind === "confirm" ? null : (
          <div className="sm:pl-[calc(36px+1rem)]">
            <ActionPromptFields
              request={request}
              idPrefix={headingId}
              describedBy={helperId}
              reason={reason}
              onReasonChange={setReason}
              values={values}
              onValuesChange={setValues}
            />
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn btn-ghost justify-center"
            disabled={busy}
            data-testid="action-prompt-cancel"
            onClick={cancel}
          >
            {cancelLabel}
          </button>
          {request.kind === "confirm" ? (
            <button
              type="button"
              className={confirmClass}
              disabled={busy || !confirmArmed}
              data-testid="action-prompt-confirm"
              data-confirm-armed={confirmArmed ? "true" : "false"}
              style={{ pointerEvents: confirmArmed ? "auto" : "none" }}
              onMouseDown={rejectUnarmedConfirm}
              onClick={() => {
                if (
                  !shouldAcceptConfirmClick({
                    kind: request.kind,
                    armed: confirmArmed,
                  })
                ) {
                  return;
                }
                onConfirm({});
              }}
            >
              {busy ? "Working…" : request.confirmLabel}
            </button>
          ) : (
            <button
              type="submit"
              className={confirmClass}
              disabled={
                busy ||
                (request.kind === "reason" && !reason.trim()) ||
                (request.kind === "fields" &&
                  request.fields.some(
                    (field) =>
                      (field.required ?? true) &&
                      !(values[field.name] ?? "").trim(),
                  ))
              }
              data-testid="action-prompt-confirm"
            >
              {busy ? "Working…" : request.confirmLabel}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

function initialValues(request: ActionPromptRequest): Record<string, string> {
  if (request.kind !== "fields") return {};
  return Object.fromEntries(
    request.fields.map((field) => [field.name, field.defaultValue ?? ""]),
  );
}
