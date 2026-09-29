/** Focus + modality helpers for the action prompt's native <dialog>. */

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const FIELD = "input:not([disabled]), select:not([disabled]), textarea";

/**
 * Open as a modal in the top layer so the prompt escapes whatever card, table
 * row, or sheet rendered its host. Environments without showModal (jsdom)
 * fall back to a plain open dialog in place.
 */
export function openModal(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") {
    try {
      dialog.showModal();
      return;
    } catch {
      // Detached or already-open non-modal: fall through to the attribute.
    }
  }
  dialog.setAttribute("open", "");
}

export function closeModal(dialog: HTMLDialogElement): void {
  if (!dialog.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

/**
 * First field when the prompt asks for input; otherwise the cancel control.
 * Confirm-kind prompts never start on the confirm button (Origin focuses
 * Cancel for destructive alerts, and confirm is inert until armed anyway).
 */
export function initialFocusTarget(root: HTMLElement): HTMLElement | null {
  return (
    root.querySelector<HTMLElement>(FIELD) ??
    root.querySelector<HTMLElement>('[data-testid="action-prompt-cancel"]')
  );
}

/** Keep Tab / Shift+Tab inside the dialog. Returns true when it wrapped. */
export function trapTab(
  event: { shiftKey: boolean; preventDefault: () => void },
  root: HTMLElement,
): boolean {
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE),
  ).filter((node) => node.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) {
    event.preventDefault();
    return true;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && root.contains(active);
  if (event.shiftKey && (active === first || !inside)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !inside)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
