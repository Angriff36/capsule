import { CapsuleCommandCatalog } from "../CapsuleCommandCatalog";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { CapsuleAgentToolCallRouter } from "./CapsuleAgentToolCallRouter";
import { CapsuleAgentToolDefinitionFactory } from "./CapsuleAgentToolDefinitionFactory";
import { CapsuleAgentToolNameMapper } from "./CapsuleAgentToolNameMapper";
import type {
  AnthropicTool,
  CapsuleAgentToolBridgeOptions,
  CapsuleAgentToolCall,
  CapsuleAgentToolResult,
  CapsuleLlmToolFormat,
  OpenAITool,
} from "./CapsuleAgentToolTypes";

/**
 * Capsule LLM tool bridge: defs from wiring + agent-sdk snake names;
 * execution through ConvexCommandClient / CapsuleCommandExecutor.
 */
export class CapsuleAgentToolBridge {
  private readonly definitionFactory: CapsuleAgentToolDefinitionFactory;
  private readonly callRouter: CapsuleAgentToolCallRouter;

  constructor(
    executor: CapsuleCommandExecutor,
    catalog: CapsuleCommandCatalog = new CapsuleCommandCatalog(),
    options: CapsuleAgentToolBridgeOptions = {},
  ) {
    const strategy = options.toolNameStrategy ?? "snake";
    const nameMapper = new CapsuleAgentToolNameMapper(catalog.list(), strategy);
    this.definitionFactory = new CapsuleAgentToolDefinitionFactory(
      catalog,
      nameMapper,
    );
    this.callRouter = new CapsuleAgentToolCallRouter(
      catalog,
      executor,
      nameMapper,
    );
  }

  getToolDefinitions(
    format: "anthropic",
    options?: { includeBuiltins?: boolean },
  ): AnthropicTool[];
  getToolDefinitions(
    format: "openai",
    options?: { includeBuiltins?: boolean },
  ): OpenAITool[];
  getToolDefinitions(
    format: CapsuleLlmToolFormat,
    options?: { includeBuiltins?: boolean },
  ): AnthropicTool[] | OpenAITool[];
  getToolDefinitions(
    format: CapsuleLlmToolFormat,
    options?: { includeBuiltins?: boolean },
  ): AnthropicTool[] | OpenAITool[] {
    return this.definitionFactory.getToolDefinitions(format, options);
  }

  executeToolCall(call: CapsuleAgentToolCall): Promise<CapsuleAgentToolResult> {
    return this.callRouter.executeToolCall(call);
  }
}
