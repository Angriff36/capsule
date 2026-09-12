// Client-side executor for assistant tool calls.
//
// Runs each call against the SAME generated mutations/queries the UI uses, in
// the signed-in user's session — identical authz, no separate AI surface
// (docs/generation/2026-07-17-command-api-surface-boundary.md). The execution
// spec ships with every tool call from convex/assistantTurn.ts, so this file
// never imports the command catalog.
import type { FunctionReference } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../lib/api";
import type { AssistantToolCall } from "../../../convex/assistantTurn";

const mutationRefs = api.mutations as unknown as Record<
  string,
  FunctionReference<"mutation">
>;
const queryRefs = api.queries as unknown as Record<
  string,
  FunctionReference<"query">
>;

/** Cap tool results sent back to the model — list reads can be large. */
const MAX_RESULT_CHARS = 6000;

function truncate(result: unknown): string {
  const json = JSON.stringify(result ?? null);
  if (json.length <= MAX_RESULT_CHARS) return json;
  // Stay valid JSON — the model reads this, and the UI chips parse it.
  return JSON.stringify({
    truncated: true,
    raw: json.slice(0, MAX_RESULT_CHARS),
  });
}

function toEpochMs(value: unknown): unknown {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return value;
}

/**
 * Execute one tool call. Returns the tool message content for the model —
 * never throws: failures become error payloads the model can read and react to.
 */
export async function executeAssistantToolCall(
  convex: ConvexReactClient,
  call: AssistantToolCall,
): Promise<string> {
  try {
    const parsed = JSON.parse(call.argumentsJson || "{}") as Record<
      string,
      unknown
    >;
    if (call.execution.kind === "query") {
      const ref = queryRefs[call.execution.queryName];
      if (!ref) throw new Error(`Unknown query ${call.execution.queryName}.`);
      const result = await convex.query(ref, parsed);
      return truncate(result);
    }
    const spec = call.execution;
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key === "docId" || spec.paramNames.includes(key)) args[key] = value;
    }
    for (const name of spec.dateLikeParamNames) {
      if (name in args) args[name] = toEpochMs(args[name]);
    }
    const ref = mutationRefs[spec.mutationName];
    if (!ref) throw new Error(`Unknown mutation ${spec.mutationName}.`);
    const result = await convex.mutation(ref, args);
    return truncate(result ?? { ok: true });
  } catch (err) {
    return truncate({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
