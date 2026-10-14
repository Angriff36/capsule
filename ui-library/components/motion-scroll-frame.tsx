import { type ReactNode, type RefObject, useRef } from "react";

/** A fixed-height scroll box so scroll-driven demos work inside Storybook's frame.
 *  The ref is passed to the demo so it can use this box as its scroll container. */
export function ScrollFrame({
  height = 520,
  className = "",
  children,
}: {
  height?: number;
  className?: string;
  children: (container: RefObject<HTMLDivElement | null>) => ReactNode;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={container}
      className={`relative overflow-auto rounded-md border ${className}`}
      style={{ height }}
    >
      {children(container)}
    </div>
  );
}
