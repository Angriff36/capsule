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
import { action, type ActionCtx } from "./_generated/server";
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

const fileValidator = v.object({
  storageId: v.string(),
  name: v.string(),
  mime: v.string(),
  kind: v.union(v.literal("image"), v.literal("text")),
});

const messageValidator = v.object({
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
  content: v.optional(v.string()),
  toolCalls: v.optional(v.array(toolCallValidator)),
  toolCallId: v.optional(v.string()),
  files: v.optional(v.array(fileValidator)),
});

export interface AssistantFile {
  storageId: string;
  name: string;
  mime: string;
  kind: "image" | "text";
}

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

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<ContentPart>;
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
    "You help with events, dishes, prep tasks, clients, fleet and deliveries, pack lists, equipment, purchasing, vendor orders, shifts, time off, and saved reports.",
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
    "",
    "## Ops Final Lock procedure",
    "When asked to run an Ops Final Lock on an event, work these sections in order and report a PASS/FLAG line for each. Read the event first (get_event), then its dishes (list_event_dishes), pack lists, and shifts.",
    "1. INFO — service style and guest count present and consistent. If blank or contradictory, STOP and tell the user to raise it with sales; an event sales did not finish cannot be finished by ops.",
    "2. MENU — correct order (mains, then sides, then dessert/place settings last); quantities sane for the guest count (500 linens on a 130-guest event is wrong); flag items with empty names/descriptions (empty shells — nothing gets packed or ordered for them); surface any line notes (e.g. 'served in cone, not tray') so packing knows.",
    "3. TIMELINE — back out from serve time: full-service staff arrive 3 hours prior, limited 1.5 hours; subtract travel time for departure from shop; subtract 1 hour load time for schedule-ON (more for multi-vehicle events). Staff OFF ≈ event end + 1 hour cleanup/reload + travel. Propose Shift.schedule writes when asked.",
    "4. SETUP NOTES — the notes field is the field team's north star. 'Edit to amplify': fill gaps, kill redundancy, add detail that affects packing (linen colors, dietary counts, rain plans, kit descriptions). Propose Event.changeRequirements with the amplified text for approval.",
    "5. PACKLIST — flag quantity anomalies vs guest count, duplicated items, and placeholder/X items; verify tent, handwashing, tarp, flooring are present for on-site events.",
    "6. EQUIP — rentals and coordinating serving items match the service style (trays + jacks for plated, station equipment for stations).",
    "7. WRAP UP — if everything passes and the user confirms, offer to mark the event final. Event.finalizeEvent only succeeds once the event is in the executing stage; if the event is earlier in its lifecycle, say that marking Final happens when it reaches execution, and do not propose commands that will be denied.",
  ].join("\n");
}

/** Images become inline data URLs; text files are inlined as text blocks. */
async function buildUserContent(
  ctx: ActionCtx,
  m: {
    content?: string;
    files?: AssistantFile[];
  },
  urls: Record<string, string | null>,
  inline: boolean,
): Promise<string | Array<ContentPart>> {
  const files = m.files ?? [];
  if (files.length === 0) return m.content ?? "";
  const parts: Array<ContentPart> = [];
  if (m.content) parts.push({ type: "text", text: m.content });
  for (const file of files) {
    // Only the newest user turn re-reads files — older turns keep a
    // placeholder so multi-turn vision threads don't re-send megabytes.
    if (!inline) {
      parts.push({
        type: "text",
        text: `[attached ${file.kind === "image" ? "image" : "file"}: ${file.name} — already shared earlier in this conversation]`,
      });
      continue;
    }
    const url = urls[file.storageId];
    if (!url) {
      parts.push({
        type: "text",
        text: `[attached ${file.kind === "image" ? "image" : "file"} ${file.name} is not available to you]`,
      });
      continue;
    }
    const response = await fetch(url);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (file.kind === "image") {
      if (bytes.length > 5 * 1024 * 1024) {
        parts.push({
          type: "text",
          text: `[attached image ${file.name} is too large to read]`,
        });
        continue;
      }
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${file.mime};base64,${bytes.toString("base64")}`,
        },
      });
    } else {
      const text = bytes.subarray(0, 200_000).toString("utf8");
      parts.push({
        type: "text",
        text: `Attached file "${file.name}":\n${text}${bytes.length > 200_000 ? "\n…(truncated)" : ""}`,
      });
    }
  }
  return parts;
}

function endpoint(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  if (root.endsWith("/chat/completions")) return root;
  return `${root}/chat/completions`;
}

/** History caps — a runaway thread must not burn action time or LLM budget. */
const MAX_MESSAGES = 60;
const MAX_HISTORY_CHARS = 150_000;

type TurnMessage = {
  role: "user" | "assistant" | "tool";
  content?: string;
  files?: AssistantFile[];
  toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
  toolCallId?: string;
};

/**
 * Drop whole rounds from the FRONT (never an orphan tool result, which
 * providers reject) until the history fits the caps. A round starts at a
 * user message; normal threads start with one, so trimming drops from the
 * SECOND user message onward and always leaves a user message first.
 */
function trimHistory(messages: TurnMessage[]): TurnMessage[] {
  let out = messages;
  const size = (ms: TurnMessage[]) =>
    ms.reduce(
      (n, m) =>
        n +
        (m.content?.length ?? 0) +
        (m.toolCalls?.reduce(
          (k, c) => k + c.argumentsJson.length + c.name.length + c.id.length,
          0,
        ) ?? 0),
      0,
    );
  while (out.length > MAX_MESSAGES || size(out) > MAX_HISTORY_CHARS) {
    const secondUser = out.findIndex((m, i) => i > 0 && m.role === "user");
    if (secondUser < 0) break; // single round left — nothing safe to drop
    out = out.slice(secondUser);
  }
  return out;
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

    const wire: WireMessage[] = [{ role: "system", content: systemPrompt() }];
    // Resolve every referenced file once, scoped to the caller (tenant-
    // referenced blobs or the caller's own registered uploads).
    const history = trimHistory(args.messages);
    const lastUserIndex = history.reduce(
      (last, m, i) => (m.role === "user" && m.files?.length ? i : last),
      -1,
    );
    const allFiles = history.flatMap((m) => m.files ?? []);
    const urlMap: Record<string, string | null> = {};
    if (allFiles.length > 0) {
      const resolved = await ctx.runQuery(
        internal.assistantConfig.resolveFiles,
        {
          subject: identity.subject,
          files: allFiles.map((f) => ({
            storageId: f.storageId,
            kind: f.kind,
          })),
        },
      );
      for (const r of resolved) urlMap[r.storageId] = r.url;
    }
    for (let i = 0; i < history.length; i++) {
      const m = history[i];
      if (m.role === "user") {
        wire.push({
          role: "user",
          content: await buildUserContent(ctx, m, urlMap, i === lastUserIndex),
        });
      } else if (m.role === "assistant") {
        wire.push({
          role: "assistant",
          content: m.content ?? "",
          ...(m.toolCalls
            ? {
                tool_calls: m.toolCalls.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: c.argumentsJson },
                })),
              }
            : {}),
        });
      } else {
        wire.push({
          role: "tool",
          content: m.content ?? "",
          tool_call_id: m.toolCallId ?? "",
        });
      }
    }

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
      console.error(
        `assistantTurn: could not reach model endpoint: ${String(err)}`,
      );
      return {
        content:
          "Could not reach the assistant model. Check the endpoint under Administration → Assistant, or try again later.",
        toolCalls: [],
        error: "network",
      };
    }
    if (!response.ok) {
      // Log the body server-side only — provider error pages do not belong
      // in a user's chat transcript.
      const body = await response.text().catch(() => "");
      console.error(
        `assistantTurn: model endpoint ${response.status}: ${body.slice(0, 500)}`,
      );
      return {
        content: `The assistant model request failed (${response.status}). Check the model endpoint configuration under Administration → Assistant.`,
        toolCalls: [],
        error: "upstream",
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
