import { useCallback, type ReactNode } from "react";
import { reportActionOk, type ActionResultLink } from "./action-result";

/**
 * Confirmation for create/save actions. Posts to the shell result strip so
 * the operator sees that the action took hold even after they scroll.
 */
export function useSuccessToast(): {
  notifySuccess: (
    message: string,
    actions?: readonly ActionResultLink[],
  ) => void;
  host: ReactNode;
} {
  const notifySuccess = useCallback(
    (next: string, actions?: readonly ActionResultLink[]) => {
      reportActionOk(next, actions);
    },
    [],
  );

  return { notifySuccess, host: null };
}
