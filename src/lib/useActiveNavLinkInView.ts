import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/** A phone shows only part of a long section row, so the picked section can
 *  sit off screen. Slide the row (never the page) until the picked one shows. */
export function useActiveNavLinkInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const row = ref.current;
    const active = row?.querySelector<HTMLElement>("a.active");
    if (!row || !active) return;
    const rowBox = row.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (box.left >= rowBox.left && box.right <= rowBox.right) return;
    row.scrollLeft += box.left - rowBox.left - (rowBox.width - box.width) / 2;
  }, [pathname]);
  return ref;
}
