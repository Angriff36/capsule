// Assistant conversation loop: browser-in-the-loop tool execution.
//
// Each round asks convex/assistantTurn.ts for the next assistant message; any
// requested tool calls execute HERE in the signed-in user's session (see
// assistantClient.ts) and the results go back as the next turn. The action
// never writes data, so authz stays identical to the UI.
import { useCallback, useRef, useState } from "react";
import { useAction, useConvex } from "convex/react";
import { api } from "../../lib/api";
import type {
  AssistantToolCall,
  AssistantTurnResult,
} from "../../../convex/assistantTurn";
import { executeAssistantToolCall } from "./assistantClient";

export interface AssistantUiMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: AssistantToolCall[];
  toolCallId?: string;
  toolName?: string;
}

interface ServerMessage {
  role: "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: Array<Pick<AssistantToolCall, "id" | "name" | "argumentsJson">>;
  toolCallId?: string;
}

/** Guard against a model stuck in a tool-calling loop. */
const MAX_ROUNDS = 8;

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `assistant-msg-${nextId}`;
}

export function useAssistantChat() {
  const runTurn = useAction(api.assistantTurn.turn);
  const convex = useConvex();
  const [messages, setMessages] = useState<AssistantUiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convoRef = useRef<ServerMessage[]>([]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (busy || trimmed.length === 0) return;
      setError(null);
      setBusy(true);
      convoRef.current = [
        ...convoRef.current,
        { role: "user", content: trimmed },
      ];
      setMessages((m) => [
        ...m,
        { id: newId(), role: "user", content: trimmed },
      ]);
      try {
        for (let round = 0; round <= MAX_ROUNDS; round++) {
          const res: AssistantTurnResult = await runTurn({
            messages: convoRef.current,
          });
          // Every assistant turn — final answers included — enters the
          // conversation, or multi-turn follow-ups lose what was said.
          const serverToolCalls = res.toolCalls.map((c) => ({
            id: c.id,
            name: c.name,
            argumentsJson: c.argumentsJson,
          }));
          convoRef.current = [
            ...convoRef.current,
            {
              role: "assistant",
              content: res.content,
              toolCalls:
                serverToolCalls.length > 0 ? serverToolCalls : undefined,
            },
          ];
          setMessages((m) => [
            ...m,
            {
              id: newId(),
              role: "assistant",
              content: res.content,
              toolCalls: res.toolCalls.length > 0 ? res.toolCalls : undefined,
            },
          ]);
          if (res.toolCalls.length === 0) {
            if (res.error != null) setError(res.error);
            break;
          }
          // Refuse, don't run, tool calls proposed by the last allowed round:
          // running them would apply writes the model can never report on.
          if (round === MAX_ROUNDS) {
            setMessages((m) => [
              ...m,
              {
                id: newId(),
                role: "assistant",
                content: `Stopped after ${MAX_ROUNDS} tool rounds without running the last step. Ask me to continue if the task is not done.`,
              },
            ]);
            break;
          }
          for (const call of res.toolCalls) {
            const result = await executeAssistantToolCall(convex, call);
            convoRef.current = [
              ...convoRef.current,
              { role: "tool", content: result, toolCallId: call.id },
            ];
            setMessages((m) => [
              ...m,
              {
                id: newId(),
                role: "tool",
                content: result,
                toolCallId: call.id,
                toolName: call.name,
              },
            ]);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, convex, runTurn],
  );

  const reset = useCallback(() => {
    if (busy) return;
    convoRef.current = [];
    setMessages([]);
    setError(null);
  }, [busy]);

  return { messages, busy, error, send, reset };
}
