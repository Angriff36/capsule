import type {
  CapsuleCommandCatalog,
  CapsuleCommandDescriptor,
} from "../CapsuleCommandCatalog";
import { CapsuleCommandUiGapBanner } from "../CapsuleCommandUiGapBanner";
import { CapsuleAgentBuiltinToolNames } from "./CapsuleAgentBuiltinToolNames";
import { CapsuleAgentToolNameMapper } from "./CapsuleAgentToolNameMapper";
import type {
  AnthropicTool,
  CapsuleLlmToolFormat,
  OpenAITool,
} from "./CapsuleAgentToolTypes";
import { CapsuleWiringJsonSchemaFactory } from "./CapsuleWiringJsonSchemaFactory";

export interface CapsuleAgentToolDefinitionOptions {
  includeBuiltins?: boolean;
}

/**
 * Generates Anthropic/OpenAI tool definitions from the wiring-backed catalog.
 */
export class CapsuleAgentToolDefinitionFactory {
  private readonly schemaFactory = new CapsuleWiringJsonSchemaFactory();
  private readonly uiBanner = new CapsuleCommandUiGapBanner();

  constructor(
    private readonly catalog: CapsuleCommandCatalog,
    private readonly nameMapper: CapsuleAgentToolNameMapper,
  ) {}

  getToolDefinitions(
    format: "anthropic",
    options?: CapsuleAgentToolDefinitionOptions,
  ): AnthropicTool[];
  getToolDefinitions(
    format: "openai",
    options?: CapsuleAgentToolDefinitionOptions,
  ): OpenAITool[];
  getToolDefinitions(
    format: CapsuleLlmToolFormat,
    options?: CapsuleAgentToolDefinitionOptions,
  ): AnthropicTool[] | OpenAITool[];
  getToolDefinitions(
    format: CapsuleLlmToolFormat,
    options: CapsuleAgentToolDefinitionOptions = {},
  ): AnthropicTool[] | OpenAITool[] {
    const includeBuiltins = options.includeBuiltins ?? true;
    const anthropic = [
      ...(includeBuiltins ? this.builtinAnthropicTools() : []),
      ...this.catalog
        .list()
        .map((descriptor) => this.toAnthropicTool(descriptor)),
    ];
    if (format === "anthropic") {
      return anthropic;
    }
    return anthropic.map((tool) => this.toOpenAITool(tool));
  }

  private toAnthropicTool(descriptor: CapsuleCommandDescriptor): AnthropicTool {
    const name = this.nameMapper.toolNameFor(descriptor.capabilityId);
    const emits =
      descriptor.emits.length > 0
        ? ` Emits: ${descriptor.emits.join(", ")}.`
        : "";
    const instanceHint = descriptor.requiresDocumentId
      ? " Requires docId of the target instance."
      : "";
    const noUi = this.uiBanner.descriptionPrefix(descriptor.capabilityId);
    return {
      name,
      description:
        `${noUi}Capsule governed command ${descriptor.capabilityId} ` +
        `(Convex ${descriptor.mutationName}).` +
        ` uiImplemented=${descriptor.uiImplemented}.${emits}${instanceHint}`,
      input_schema: this.schemaFactory.toObjectSchemaForDescriptor(descriptor),
    };
  }

  private toOpenAITool(tool: AnthropicTool): OpenAITool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    };
  }

  private builtinAnthropicTools(): AnthropicTool[] {
    return [
      {
        name: CapsuleAgentBuiltinToolNames.listCommands,
        description:
          "List Capsule AC governed commands. Includes uiImplemented / uiGaps — warn humans when false.",
        input_schema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: CapsuleAgentBuiltinToolNames.describeCommand,
        description:
          "Describe one Capsule capability: params, Convex mutation, emits.",
        input_schema: {
          type: "object",
          properties: {
            capabilityId: {
              type: "string",
              description: "e.g. Recipe.draft, Ingredient.introduce",
            },
          },
          required: ["capabilityId"],
          additionalProperties: false,
        },
      },
    ];
  }
}
