import { useCallback, useState } from "react";
import { reportActionFail, reportActionOk } from "./ActionResultStore";

/**
 * Drop-in for local notice/error state. Keeps the inline banner a page
 * already renders, and also posts the same result to the shell strip so
 * the operator sees that the action took hold.
 */
export function useActionNotice(): {
  notice: string | null;
  setNotice: (message: string | null) => void;
} {
  const [notice, setLocal] = useState<string | null>(null);
  const setNotice = useCallback((message: string | null) => {
    setLocal(message);
    if (message) reportActionOk(message);
  }, []);
  return { notice, setNotice };
}

export function useActionFailure(): {
  error: string | null;
  setError: (message: string | null) => void;
} {
  const [error, setLocal] = useState<string | null>(null);
  const setError = useCallback((message: string | null) => {
    setLocal(message);
    if (message) reportActionFail(message);
  }, []);
  return { error, setError };
}
