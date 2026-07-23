import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CapsuleCommandCatalogProvider } from "../CapsuleCommandCatalogProvider";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { CapsuleAgentToolBridge } from "../llm/CapsuleAgentToolBridge";
import { CapsuleAgentToolNameMapper } from "../llm/CapsuleAgentToolNameMapper";
import type { CapsuleLlmToolFormat } from "../llm/CapsuleAgentToolTypes";
import { CapsuleMcpTextResult } from "./CapsuleMcpTextResult";

/**
 * MCP surface: Anthropic/OpenAI def export + execute-by-snake-name.
 * Does not register one MCP tool per capability — that freezes tools/list at
 * host startup (#16). Discover via list_capsule_commands / get_capsule_llm_tools;
 * execute via execute_capsule_command / execute_capsule_llm_tool.
 */
export class CapsuleMcpLlmToolRegistrar {
  private readonly text = new CapsuleMcpTextResult();

  constructor(
    private readonly catalogProvider: CapsuleCommandCatalogProvider,
    private readonly executor: CapsuleCommandExecutor,
  ) {}

  register(server: McpServer): void {
    this.registerMetaTools(server);
  }

  /** Always empty — per-capability MCP tools are intentionally not registered. */
  listCommandToolNames(): string[] {
    return [];
  }

  private bridge(): CapsuleAgentToolBridge {
    return new CapsuleAgentToolBridge(
      this.executor,
      this.catalogProvider.get(),
    );
  }

  private registerMetaTools(server: McpServer): void {
    server.tool(
      "get_capsule_llm_tools",
      "Return Anthropic or OpenAI tool definitions for every Capsule wiring capability (reloads catalog from disk). Descriptions flag NO UI when uiImplemented is false.",
      {
        format: z
          .enum(["anthropic", "openai"])
          .describe("LLM provider tool schema format"),
      },
      async ({ format }) => {
        const catalog = this.catalogProvider.get();
        return this.text.format(
          {
            format,
            tools: this.bridge().getToolDefinitions(
              format as CapsuleLlmToolFormat,
            ),
            uiGaps: catalog.uiGaps(),
          },
          { warnCapabilityIds: catalog.uiGaps() },
        );
      },
    );

    server.tool(
      "execute_capsule_llm_tool",
      "Execute a Capsule LLM tool by snake name (e.g. recipe_draft). Prefer execute_capsule_command with capabilityId when calling from agents.",
      {
        name: z.string().describe("Tool name from get_capsule_llm_tools"),
        arguments: z
          .record(z.unknown())
          .describe("Tool arguments including optional idempotencyKey"),
      },
      async ({ name, arguments: args }) => {
        const catalog = this.catalogProvider.get();
        const nameMapper = new CapsuleAgentToolNameMapper(
          catalog.list(),
          "snake",
        );
        const result = await this.bridge().executeToolCall({
          name,
          arguments: args,
        });
        const capabilityId = nameMapper.capabilityIdFor(name);
        return this.text.format(result, {
          warnCapabilityIds: capabilityId ? [capabilityId] : [],
        });
      },
    );
  }
}
