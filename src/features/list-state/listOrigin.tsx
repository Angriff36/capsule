import { type MouseEvent, type ReactNode } from "react";
import {
  Link,
  type LinkProps,
  useLocation,
  useNavigate,
} from "react-router-dom";

const ENTRY_KEY_PREFIX = "capsule:list-entry:";

export type ListOrigin = {
  href: string;
  entryKey: string;
  historyIndex: number;
};

export type ListOriginState = { listOrigin?: ListOrigin };

function historyIndex() {
  const index = window.history.state?.idx;
  return typeof index === "number" ? index : -1;
}

function savedEntryKey(index: number) {
  try {
    return sessionStorage.getItem(`${ENTRY_KEY_PREFIX}${index}`);
  } catch {
    return null;
  }
}

export function recordHistoryEntry(index: number, entryKey: string) {
  if (index < 0) return;
  try {
    sessionStorage.setItem(`${ENTRY_KEY_PREFIX}${index}`, entryKey);
  } catch {
    // Private and embedded contexts may not expose session storage.
  }
}

export function useListOrigin(): ListOrigin {
  const location = useLocation();
  return {
    href: `${location.pathname}${location.search}${location.hash}`,
    entryKey: location.key,
    historyIndex: historyIndex(),
  };
}

export function listOriginState(origin: ListOrigin): ListOriginState {
  return { listOrigin: origin };
}

export function readListOrigin(state: unknown): ListOrigin | null {
  const origin = (state as ListOriginState | null)?.listOrigin;
  if (
    !origin ||
    typeof origin.href !== "string" ||
    typeof origin.entryKey !== "string" ||
    typeof origin.historyIndex !== "number"
  ) {
    return null;
  }
  return origin;
}

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  );
}

/** A real link that uses Back only when the originating list is immediately behind it. */
export function ReturnToListLink({
  fallback,
  children,
  onClick,
  ...props
}: Omit<LinkProps, "to"> & { fallback: string; children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const origin = readListOrigin(location.state);
  const href = origin?.href ?? fallback;

  return (
    <Link
      {...props}
      to={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || isModifiedClick(event)) return;
        if (!origin) return;
        event.preventDefault();
        const immediatePredecessor = savedEntryKey(origin.historyIndex);
        if (
          historyIndex() === origin.historyIndex + 1 &&
          immediatePredecessor === origin.entryKey
        ) {
          navigate(-1);
          return;
        }
        navigate(origin.href, {
          state: { restoreScrollFromEntryKey: origin.entryKey },
        });
      }}
    >
      {children}
    </Link>
  );
}
