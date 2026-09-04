import { useEffect, useMemo, useRef, useState } from "react";

type VirtualWindowOptions = {
  count: number;
  rowHeight: number;
  overscan?: number;
};

type VirtualRow = {
  index: number;
  offset: number;
};

/**
 * Small fixed-height virtual window for long operational indexes. Data stays
 * available for client-side search/sort, while React only mounts the rows in
 * and just outside the scroll viewport.
 */
export function useVirtualWindow({
  count,
  rowHeight,
  overscan = 5,
}: VirtualWindowOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const measure = () => setViewportHeight(node.clientHeight);
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const maximum = Math.max(0, count * rowHeight - node.clientHeight);
    if (node.scrollTop > maximum) node.scrollTop = maximum;
    setScrollTop(node.scrollTop);
  }, [count, rowHeight]);

  const virtualRows = useMemo(() => {
    const visibleHeight = viewportHeight || rowHeight * 8;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(
      count,
      Math.ceil((scrollTop + visibleHeight) / rowHeight) + overscan,
    );
    const rows: VirtualRow[] = [];
    for (let index = start; index < end; index += 1) {
      rows.push({ index, offset: index * rowHeight });
    }
    return rows;
  }, [count, overscan, rowHeight, scrollTop, viewportHeight]);

  return {
    scrollRef,
    virtualRows,
    totalHeight: count * rowHeight,
    onScroll: (event: React.UIEvent<HTMLDivElement>) =>
      setScrollTop(event.currentTarget.scrollTop),
  };
}
