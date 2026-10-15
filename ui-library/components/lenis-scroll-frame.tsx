import { ReactLenis, type LenisRef } from "lenis/react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from "react";

/** Original behaviour: Lenis smooth scrolling on the page (`<ReactLenis root>`).
 *  When `bounded` is set the demo lives in a LenisScrollFrame instead, so no page-level Lenis. */
export function LenisRoot({
  bounded = false,
  children,
}: {
  bounded?: boolean;
  children: ReactNode;
}) {
  if (bounded) return <>{children}</>;
  return <ReactLenis root>{children}</ReactLenis>;
}

/** A fixed-height scroll box driven by Lenis, so smooth-scroll demos work inside Storybook's frame.
 *  The wrapper element is passed to the demo as its scroll container. */
export function LenisScrollFrame({
  height = 520,
  children,
}: {
  height?: number;
  children: (container: RefObject<HTMLElement | null>) => ReactNode;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const setLenis = useCallback((lenis: LenisRef | null) => {
    containerRef.current = lenis?.wrapper ?? null;
    setReady(containerRef.current !== null);
  }, []);

  return (
    <ReactLenis
      ref={setLenis}
      className="relative overflow-auto rounded-md border"
      style={{ height }}
    >
      {ready ? children(containerRef) : null}
    </ReactLenis>
  );
}
