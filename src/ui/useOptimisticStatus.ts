import { useCallback, useState } from "react";

/**
 * Overlays a pending status on a row the instant a transition fires so the
 * StatusChip flips immediately, then defers to Convex reactivity for the real
 * value. Convex resolves a mutation promise only after the local query cache
 * reflects the write, so calling `end` once the mutation settles reveals the
 * confirmed status with no flicker; a failed mutation drops the overlay and the
 * row reverts to its actual status.
 */
export function useOptimisticStatus() {
  const [pending, setPending] = useState<Record<string, string>>({});

  const begin = useCallback((id: string, status: string) => {
    setPending((prev) => ({ ...prev, [id]: status }));
  }, []);

  const end = useCallback((id: string) => {
    setPending((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const statusOf = useCallback(
    (id: string, actual: string) => pending[id] ?? actual,
    [pending],
  );

  return { begin, end, statusOf };
}
