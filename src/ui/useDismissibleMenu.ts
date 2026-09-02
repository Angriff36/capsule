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
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    details.addEventListener("click", onSelect);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      details.removeEventListener("click", onSelect);
    };
  }, [closeOnSelect]);

  return ref;
}
