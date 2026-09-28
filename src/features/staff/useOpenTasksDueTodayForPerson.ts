// Seam hook for the clock-out blocker query (convex/tasks.ts).
//
// The clock-out flow on MyDayPage wants to know whether the current
// Person has any open tasks due today so it can show a block-then-confirm
// modal. The query lives in convex/tasks.ts because it crosses entity
// boundaries (tasks + people + server-local day window), which doesn't
// fit the manifest hook shape. This file is the only place MyDayPage
// touches `convex/react` directly — everything else on MyDayPage uses
// the generated `useListX` / `useCreateX` hooks.

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../lib/api";
import type { Id } from "../../lib/api";

export type OpenTaskForClockOut = {
  _id: Id<"tasks">;
  title: string;
  dueAt: number;
  status: "pending" | "in_progress";
};

export function useOpenTasksDueTodayForPerson(
  personId: Id<"people"> | undefined,
): readonly OpenTaskForClockOut[] | undefined {
  const result = useQuery(
    api.tasks.openAndDueTodayForPerson,
    personId ? { personId } : "skip",
  );
  return useMemo(
    () => result as readonly OpenTaskForClockOut[] | undefined,
    [result],
  );
}
