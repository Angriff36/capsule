// AUTHOR-OWNED — not generated. One LLM turn for the in-app assistant.
//
// The action never touches data itself: it calls the configured
// OpenAI-compatible chat endpoint and returns the assistant message plus, for
// every requested tool call, an execution spec. The signed-in browser session
// executes those specs against the SAME generated mutations/queries the UI
// uses, then sends the results back as the next turn. Authz therefore stays
// identical to the UI (see convex/lib/assistantToolSurface.ts).
//
// Configuration: the tenant's AssistantLlmConfig row (set in-app under
// Administration → Assistant) wins; ASSISTANT_LLM_BASE_URL / _API_KEY / _MODEL
// env vars are the deployment-wide fallback. Missing both returns a clear
// assistant message instead of throwing.
"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  assistantToolDefs,
  executionSpecFor,
} from "./lib/assistantToolSurface";

const toolCallValidator = v.object({
  id: v.string(),
  name: v.string(),
  argumentsJson: v.string(),
});

const messageValidator = v.object({
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
  content: v.optional(v.string()),
  toolCalls: v.optional(v.array(toolCallValidator)),
  toolCallId: v.optional(v.string()),
});

export interface AssistantToolCall {
  id: string;
  name: string;
  argumentsJson: string;
  execution:
    | {
        kind: "mutation";
        mutationName: string;
        requiresDocumentId: boolean;
        paramNames: string[];
        dateLikeParamNames: string[];
      }
    | {
        kind: "query";
        queryName: string;
      };
}

export interface AssistantTurnResult {
  content: string;
  toolCalls: AssistantToolCall[];
  error?: "not-configured" | "network" | "upstream" | "unknown-tool";
}

interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are the Capsule assistant, embedded in the Capsule catering app.",
    "You help with events, dishes, prep tasks, and clients.",
    `Today's date is ${today}.`,
    "",
    "Rules:",
    "- Use the provided tools to read or change data. Do not invent IDs or values.",
    "- To find an ID, list first (list_events, list_dishes, ...), then act.",
    "- Entity records carry both `_id` (reads) and `docId` (writes). Commands take `docId`.",
    "- Datetimes sent to commands are epoch milliseconds. ISO 8601 strings are also accepted and converted for you.",
    "- Mutations take effect immediately for the signed-in user. For retire/cancel/remove, confirm with the user first unless they clearly asked.",
    "- After acting, report exactly what succeeded and any error text you received.",
    "- Answer in the user's language.",
  ].join("\n");
}

function toWire(m: {
  role: "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
  toolCallId?: string;
}): WireMessage {
  if (m.role === "assistant") {
    return {
      role: "assistant",
      content: m.content ?? null,
      ...(m.toolCalls
        ? {
            tool_calls: m.toolCalls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: c.argumentsJson },
            })),
          }
        : {}),
    };
  }
  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content ?? "",
      tool_call_id: m.toolCallId ?? "",
    };
  }
  return { role: "user", content: m.content ?? "" };
}

function endpoint(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  if (root.endsWith("/chat/completions")) return root;
  return `${root}/chat/completions`;
}

export const turn = action({
  args: { messages: v.array(messageValidator) },
  handler: async (ctx, args): Promise<AssistantTurnResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to use the assistant.");

    // Tenant settings row wins (set in-app under Administration → Assistant);
    // deployment env vars are the fallback.
    const settings = await ctx.runQuery(
      internal.assistantConfig.readForSubject,
      {
        subject: identity.subject,
      },
    );
    const baseUrl = settings?.baseUrl ?? process.env.ASSISTANT_LLM_BASE_URL;
    const apiKey = settings?.apiKey ?? process.env.ASSISTANT_LLM_API_KEY;
    const model = settings?.model ?? process.env.ASSISTANT_LLM_MODEL;
    if (!baseUrl || !apiKey || !model) {
      return {
        content:
          "The assistant is not configured yet. A manager can set it up under Administration → Assistant.",
        toolCalls: [],
        error: "not-configured",
      };
    }

    const wire: WireMessage[] = [
      { role: "system", content: systemPrompt() },
      ...args.messages.map(toWire),
    ];

    let response: Response;
    try {
      response = await fetch(endpoint(baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: wire,
          tools: assistantToolDefs().map((t) => t.definition),
        }),
      });
    } catch (err) {
      return {
        content: `Could not reach the assistant model: ${String(err)}`,
        toolCalls: [],
        error: "network" as const,
      };
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        content: `Assistant model request failed (${response.status}). ${body.slice(0, 300)}`,
        toolCalls: [],
        error: "upstream" as const,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments?: string };
          }>;
        };
      }>;
    };
    const message = data.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      argumentsJson: c.function.arguments ?? "{}",
      execution: executionSpecFor(c.function.name),
    }));
    const unknownTool = toolCalls.find((c) => c.execution == null);
    if (unknownTool) {
      return {
        content: `The assistant tried to use an unknown tool (${unknownTool.name}).`,
        toolCalls: [],
        error: "unknown-tool",
      };
    }
    return {
      content: message?.content ?? "",
      toolCalls: toolCalls as AssistantToolCall[],
    };
  },
});
