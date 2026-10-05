import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { ListScrollManager } from "./ListScrollManager";

type RestoreState = { restoreScrollFromEntryKey?: unknown };
const scrollManager = new ListScrollManager();

function requestedEntryKey(locationKey: string, state: unknown) {
  const key = (state as RestoreState | null)?.restoreScrollFromEntryKey;
  return typeof key === "string" ? key : locationKey;
}

function useScrollPersistence(
  scrollRef: RefObject<HTMLElement>,
  storageKey: string,
) {
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const save = () => scrollManager.write(storageKey, node.scrollTop);
    node.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      node.removeEventListener("scroll", save);
    };
  }, [scrollRef, storageKey]);
}

function isScrollIntent(event: Event) {
  if (["wheel", "touchstart", "pointerdown"].includes(event.type)) return true;
  return [
    "ArrowDown",
    "ArrowUp",
    "PageDown",
    "PageUp",
    "Home",
    "End",
    " ",
  ].includes((event as KeyboardEvent).key);
}

/** React-only coordinator for the shell's single scroller. */
export function ListScrollCoordinator({
  scrollRef,
  contentRef,
}: {
  scrollRef: RefObject<HTMLElement>;
  contentRef: RefObject<HTMLElement>;
}) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const pendingTarget = useRef<number | null>(null);
  const programmatic = useRef(false);
  useScrollPersistence(scrollRef, location.key);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const restoreKey = requestedEntryKey(location.key, location.state);
    const shouldRestore =
      navigationType === "POP" || restoreKey !== location.key;
    if (!shouldRestore) {
      pendingTarget.current = null;
      if (navigationType === "PUSH") node.scrollTop = 0;
      return;
    }
    pendingTarget.current = scrollManager.read(restoreKey);
    const restore = () => {
      const target = pendingTarget.current;
      if (target == null) return;
      programmatic.current = true;
      const result = scrollManager.restore(node, target);
      queueMicrotask(() => {
        programmatic.current = false;
      });
      if (result.complete) pendingTarget.current = null;
    };
    const cancel = (event: Event) => {
      if (
        !programmatic.current &&
        pendingTarget.current != null &&
        isScrollIntent(event)
      )
        pendingTarget.current = null;
    };
    restore();
    const content = contentRef.current;
    const observer =
      content && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(restore)
        : null;
    observer?.observe(content!);
    node.addEventListener("wheel", cancel, { passive: true });
    node.addEventListener("touchstart", cancel, { passive: true });
    node.addEventListener("pointerdown", cancel, { passive: true });
    node.addEventListener("keydown", cancel);
    return () => {
      observer?.disconnect();
      node.removeEventListener("wheel", cancel);
      node.removeEventListener("touchstart", cancel);
      node.removeEventListener("pointerdown", cancel);
      node.removeEventListener("keydown", cancel);
    };
  }, [contentRef, location.key, location.state, navigationType, scrollRef]);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);
  return null;
}

/** Entry-specific restoration for an independently scrolling virtual list. */
export function useListScrollRestoration({
  scrollRef,
  namespace,
  restoreScrollTop,
  ready,
  loaded,
  revision = 0,
}: {
  scrollRef: RefObject<HTMLElement>;
  namespace: string;
  restoreScrollTop: (
    value: number,
  ) => { applied: number; complete: boolean } | void;
  ready: number;
  loaded: boolean;
  revision?: number;
}) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const key = `${namespace}:${location.key}`;
  const restoreKey = `${namespace}:${requestedEntryKey(location.key, location.state)}`;
  const pendingTarget = useRef<number | null>(null);
  useScrollPersistence(scrollRef, key);

  useLayoutEffect(() => {
    if (navigationType !== "POP" && restoreKey === key) {
      pendingTarget.current = null;
      return;
    }
    pendingTarget.current = scrollManager.read(restoreKey);
  }, [key, navigationType, restoreKey]);

  useLayoutEffect(() => {
    const target = pendingTarget.current;
    if (target == null || !loaded || ready <= 0) return;
    const result = restoreScrollTop(target);
    if (result?.complete !== false) pendingTarget.current = null;
  }, [key, loaded, ready, restoreKey, restoreScrollTop, revision]);
}
