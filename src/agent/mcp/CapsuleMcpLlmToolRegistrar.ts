import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CapsuleCommandCatalog } from "../CapsuleCommandCatalog";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { CapsuleAgentBuiltinToolNames } from "../llm/CapsuleAgentBuiltinToolNames";
import { CapsuleAgentToolBridge } from "../llm/CapsuleAgentToolBridge";
import { CapsuleAgentToolNameMapper } from "../llm/CapsuleAgentToolNameMapper";
import { CapsuleJsonSchemaZodConverter } from "../llm/CapsuleJsonSchemaZodConverter";
import type {
  AnthropicTool,
  CapsuleLlmToolFormat,
} from "../llm/CapsuleAgentToolTypes";
import { CapsuleMcpTextResult } from "./CapsuleMcpTextResult";

/**
 * MCP surface: Anthropic/OpenAI def export + first-class snake-named tools
 * for every wiring capability in the catalog (not an AC-only subset).
 */
export class CapsuleMcpLlmToolRegistrar {
  private readonly bridge: CapsuleAgentToolBridge;
  private readonly nameMapper: CapsuleAgentToolNameMapper;
  private readonly zodConverter = new CapsuleJsonSchemaZodConverter();
  private readonly text = new CapsuleMcpTextResult();

  constructor(
    private readonly catalog: CapsuleCommandCatalog,
    executor: CapsuleCommandExecutor,
  ) {
    this.bridge = new CapsuleAgentToolBridge(executor, catalog);
    this.nameMapper = new CapsuleAgentToolNameMapper(catalog.list(), "snake");
  }

  register(server: McpServer): void {
    this.registerMetaTools(server);
    this.registerCommandTools(server);
  }

  /** Exposed for tests — tool names registered as first-class MCP commands. */
  listCommandToolNames(): string[] {
    return this.commandTools().map((tool) => tool.name);
  }

  private registerMetaTools(server: McpServer): void {
    server.tool(
      "get_capsule_llm_tools",
      "Return Anthropic or OpenAI tool definitions for Capsule AC commands. Descriptions flag NO UI when uiImplemented is false.",
      {
        format: z
          .enum(["anthropic", "openai"])
          .describe("LLM provider tool schema format"),
      },
      async ({ format }) =>
        this.text.format(
          {
            format,
            tools: this.bridge.getToolDefinitions(
              format as CapsuleLlmToolFormat,
            ),
            uiGaps: this.catalog.uiGaps(),
          },
          { warnCapabilityIds: this.catalog.uiGaps() },
        ),
    );

    server.tool(
      "execute_capsule_llm_tool",
      "Execute a Capsule LLM tool by snake name (e.g. recipe_draft). Prefer the first-class snake-named MCP tool when present.",
      {
        name: z.string().describe("Tool name from get_capsule_llm_tools"),
        arguments: z
          .record(z.unknown())
          .describe("Tool arguments including optional idempotencyKey"),
      },
      async ({ name, arguments: args }) => {
        const result = await this.bridge.executeToolCall({
          name,
          arguments: args,
        });
        const capabilityId = this.nameMapper.capabilityIdFor(name);
        return this.text.format(result, {
          warnCapabilityIds: capabilityId ? [capabilityId] : [],
        });
      },
    );
  }

  private registerCommandTools(server: McpServer): void {
    for (const tool of this.commandTools()) {
      const shape = this.zodConverter.toZodRawShape(tool.input_schema);
      const capabilityId = this.nameMapper.capabilityIdFor(tool.name);
      server.tool(tool.name, tool.description, shape, async (args) => {
        const result = await this.bridge.executeToolCall({
          name: tool.name,
          arguments: args as Record<string, unknown>,
        });
        return this.text.format(result, {
          warnCapabilityIds: capabilityId ? [capabilityId] : [],
        });
      });
    }
  }

  private commandTools(): AnthropicTool[] {
    return this.bridge
      .getToolDefinitions("anthropic", { includeBuiltins: false })
      .filter((tool) => !CapsuleAgentBuiltinToolNames.isBuiltin(tool.name));
  }
}
