import { useRef, useState, type ReactNode } from "react";

/**
 * Wraps a linked reference so hovering (or focusing) it surfaces a small
 * preview card with key fields — no navigation required. Pass `card={null}`
 * to render children plainly when there is nothing to preview.
 */
export function HoverPreview({
  children,
  card,
}: {
  children: ReactNode;
  card: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  if (!card) return <>{children}</>;

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 180);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-40 mb-1.5 block w-64 rounded-sm border border-line-2 bg-panel p-3 text-left font-sans shadow-[0_12px_32px_-12px_rgba(34,30,22,0.35)]"
        >
          {card}
        </span>
      )}
    </span>
  );
}
