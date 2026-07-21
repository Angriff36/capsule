import type { AnthropicTool, OpenAITool } from "@angriff36/manifest/agent-sdk";

export type CapsuleLlmToolFormat = "anthropic" | "openai";

export interface CapsuleAgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface CapsuleAgentToolResult {
  success: boolean;
  code?: string;
  message?: string;
  data?: unknown;
  /** Present when the command ran (or was described) with no Capsule UI. */
  uiGapWarning?: string;
  uiImplemented?: boolean;
}

export interface CapsuleAgentToolBridgeOptions {
  toolNameStrategy?: "snake" | "dot";
}

export type { AnthropicTool, OpenAITool };
