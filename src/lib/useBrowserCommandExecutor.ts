import { useConvex } from "convex/react";
import { useMemo } from "react";
import { BrowserCommandExecutor } from "../agent/BrowserCommandExecutor";
import type { CapsuleCommandExecutor } from "../agent/CapsuleCommandExecutor";

/**
 * The page's Convex client as a governed command executor. Features take
 * this instead of `useConvex()` so they stay on the generated command
 * contract (`api.mutations.*` through the capability catalog) rather than
 * calling Convex directly.
 */
export function useBrowserCommandExecutor(): CapsuleCommandExecutor {
  const convex = useConvex();
  return useMemo(() => new BrowserCommandExecutor(convex), [convex]);
}
