import { Suspense, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import Model from "./image-ripple-effect-model";
import type { Dimension, MousePosition } from "./image-ripple-effect-model";

/** Measures the container (the original measures the window). */
function useDimension(ref: RefObject<HTMLDivElement | null>): Dimension {
  const [dimension, setDimension] = useState<Dimension>({
    width: 0,
    height: 0,
    pixelRatio: 1,
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      setDimension({
        width: el.clientWidth,
        height: el.clientHeight,
        pixelRatio: window.devicePixelRatio,
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return dimension;
}

/** Pointer position relative to the container's top-left corner. */
function useMouse(ref: RefObject<HTMLDivElement | null>) {
  const mouse = useRef<MousePosition>({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      mouse.current = {
        x: e.clientX - (rect?.left ?? 0),
        y: e.clientY - (rect?.top ?? 0),
      };
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [ref]);
  return mouse;
}

export default function ImageRippleEffect() {
  const containerRef = useRef<HTMLDivElement>(null);
  const device = useDimension(containerRef);
  const mouse = useMouse(containerRef);

  const frustumSize = device.height;
  const aspect = device.width / device.height;
  const ready = device.width > 0 && device.height > 0;

  return (
    <div
      ref={containerRef}
      className="h-[480px] w-full relative overflow-hidden bg-neutral-950 text-white"
    >
      {ready && (
        <Canvas>
          <OrthographicCamera
            makeDefault
            args={[
              (frustumSize * aspect) / -2,
              (frustumSize * aspect) / 2,
              frustumSize / 2,
              frustumSize / -2,
              -1000,
              1000,
            ]}
            position={[0, 0, 2]}
          />
          <Suspense fallback={null}>
            <Model device={device} mouse={mouse} />
          </Suspense>
        </Canvas>
      )}
      <article className="absolute w-full bottom-14  text-center pointer-events-none">
        <h1 className="2xl:text-8xl text-7xl tracking-tighter uppercase">
          Independent
        </h1>
        <p className="2xl:text-2xl text-xl">
          Live for yourself, not for society.
        </p>
      </article>
    </div>
  );
}
