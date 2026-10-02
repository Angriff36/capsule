import { useAction } from "convex/react";
import { useCallback } from "react";
import { api, type Id } from "./api";

/** Authored email-reply action kept outside sales feature components. */
export function useSendEmailReply() {
  const sendAction = useAction(api.messageReply.sendEmailReply);
  return useCallback(
    (input: { threadId: string; bodyText: string; requestId: string }) =>
      sendAction({
        threadId: input.threadId as Id<"messageThreads">,
        bodyText: input.bodyText,
        requestId: input.requestId,
      }),
    [sendAction],
  );
}
