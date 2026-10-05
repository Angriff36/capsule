import { useMutation } from "convex/react";
import { api } from "./api";

/**
 * A change made with open "fix first" items, saved together with its
 * reason: both are kept or neither is. Feature pages must not import
 * convex/react; call these.
 */
export function useSendOutWithReason() {
  return useMutation(api.reasonedChanges.sendOutWithReason);
}

export function useAssignPersonWithReason() {
  return useMutation(api.reasonedChanges.assignPersonWithReason);
}

export function useAssignRigWithReason() {
  return useMutation(api.reasonedChanges.assignRigWithReason);
}

export function useHoldEquipmentWithReason() {
  return useMutation(api.reasonedChanges.holdEquipmentWithReason);
}

/** Add what a planning suggestion asks for and keep the answer, in one save. */
export function useAcceptSuggestion() {
  return useMutation(api.reasonedChanges.acceptSuggestion);
}
