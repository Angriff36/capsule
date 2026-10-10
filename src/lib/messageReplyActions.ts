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

/** Authored text-reply action: answers a client text from the company number. */
export function useSendTextReply() {
  const sendAction = useAction(api.messageTextReply.sendTextReply);
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

/** Authored social-reply action: answers a Facebook / Instagram message. */
export function useSendSocialReply() {
  const sendAction = useAction(api.socialReply.sendSocialReply);
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
