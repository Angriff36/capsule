import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "./api";

export type RecordHistory = NonNullable<
  FunctionReturnType<typeof api.recordHistory.recordHistory>
>;

/**
 * PL-AUDIT (AC-636): who made a record, every later change, and what each
 * automatic follow-up did. Managers only; null for everyone else.
 * Event features must not import convex/react; call this instead.
 */
export function useRecordHistory(
  recordId: string,
): RecordHistory | null | undefined {
  return useQuery(api.recordHistory.recordHistory, { recordId });
}
