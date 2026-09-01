/**
 * Keep the highlighted picker option visible by moving the picker's own
 * scrollTop. Never `scrollIntoView` — that can scroll the document as well.
 */
export function keepOptionInView(
  picker: HTMLElement | null,
  optionId: string,
): void {
  if (!picker) return;
  const option = document.getElementById(optionId);
  if (!option || !picker.contains(option)) return;
  const head = picker.querySelector<HTMLElement>(".chat-picker-head");
  const headHeight = head?.offsetHeight ?? 0;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top - headHeight < picker.scrollTop) {
    picker.scrollTop = top - headHeight;
  } else if (bottom > picker.scrollTop + picker.clientHeight) {
    picker.scrollTop = bottom - picker.clientHeight;
  }
}
