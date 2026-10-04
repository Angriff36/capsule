import { useCallback, type ReactNode } from "react";
import { reportActionOk, type ActionResultAction } from "./action-result";

/**
 * Confirmation for create/save actions. Posts to the shell result strip so
 * the operator sees that the action took hold even after they scroll.
 */
export function useSuccessToast(): {
  notifySuccess: (
    message: string,
    actions?: readonly ActionResultAction[],
  ) => void;
  host: ReactNode;
} {
  const notifySuccess = useCallback(
    (next: string, actions?: readonly ActionResultAction[]) => {
      reportActionOk(next, actions);
    },
    [],
  );

  return { notifySuccess, host: null };
}
