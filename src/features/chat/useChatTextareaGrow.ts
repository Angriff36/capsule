import { useLayoutEffect, type RefObject } from "react";

/**
 * Size a `.chat-textarea` to its content whenever `value` changes — 1 row at
 * rest, 6 at most (chat.css clamps the max height). Pass `null` while the
 * textarea is not mounted so the first render with text sizes it.
 */
export function useChatTextareaGrow(
  ref: RefObject<HTMLTextAreaElement>,
  value: string | null,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [ref, value]);
}
