import { useEffect, useRef } from "react";

/**
 * A native <details> dropdown never closes itself: it lingers until the
 * summary is clicked again. This closes it on an outside pointer, on Esc,
 * and (optionally) when an item inside it is chosen. An item that shows its
 * result in place (a copy button with a "copied" state) opts out with
 * `data-keep-open` on itself or a wrapper.
 */
export function useDismissibleMenu({
  closeOnSelect = false,
}: { closeOnSelect?: boolean } = {}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const close = () => {
      details.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!details.open) return;
      if (event.target instanceof Node && details.contains(event.target))
        return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) {
        // Own the press: a sheet or dialog around the menu must stay open.
        event.preventDefault();
        close();
        (details.querySelector("summary") as HTMLElement | null)?.focus();
      }
    };
    const onSelect = (event: Event) => {
      if (!closeOnSelect || !(event.target instanceof Element)) return;
      const item = event.target.closest("a, button");
      if (!item || item === details.querySelector("summary")) return;
      if (item.closest("[data-keep-open]")) return;
      close();
    };
    // The panel hangs from its button's right edge. On a phone a button in
    // the middle of the screen pushed it past the left edge and cut off its
    // words, so an opened panel is nudged back inside the screen.
    const onToggle = () => {
      const panel = [...details.children].find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.tagName !== "SUMMARY",
      );
      if (!panel) return;
      panel.style.translate = "";
      if (!details.open) return;
      const gap = 8;
      const rect = panel.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      let shift = 0;
      if (rect.left < gap) shift = gap - rect.left;
      else if (rect.right > width - gap) shift = width - gap - rect.right;
      if (shift !== 0) panel.style.translate = `${Math.round(shift)}px 0`;
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    details.addEventListener("click", onSelect);
    details.addEventListener("toggle", onToggle);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      details.removeEventListener("click", onSelect);
      details.removeEventListener("toggle", onToggle);
    };
  }, [closeOnSelect]);

  return ref;
}
