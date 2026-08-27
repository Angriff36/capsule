import { useCallback, type ReactNode } from "react";
import { reportActionOk } from "./action-result";

/**
 * Confirmation for create/save actions. Posts to the shell result strip so
 * the operator sees that the action took hold even after they scroll.
 */
export function useSuccessToast(): {
  notifySuccess: (message: string) => void;
  host: ReactNode;
} {
  const notifySuccess = useCallback((next: string) => {
    reportActionOk(next);
  }, []);

  return { notifySuccess, host: null };
}
