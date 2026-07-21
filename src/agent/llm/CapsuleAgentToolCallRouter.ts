import type { CapsuleCommandCatalog } from "../CapsuleCommandCatalog";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { CapsuleCommandUiGapBanner } from "../CapsuleCommandUiGapBanner";
import { CapsuleAgentBuiltinToolNames } from "./CapsuleAgentBuiltinToolNames";
import type { CapsuleAgentToolNameMapper } from "./CapsuleAgentToolNameMapper";
import type {
  CapsuleAgentToolCall,
  CapsuleAgentToolResult,
} from "./CapsuleAgentToolTypes";

/**
 * Routes LLM tool calls to the Capsule Convex command executor.
 * Never constructs RuntimeEngine — persistence stays on generated mutations.
 */
export class CapsuleAgentToolCallRouter {
  private readonly uiBanner = new CapsuleCommandUiGapBanner();

  constructor(
    private readonly catalog: CapsuleCommandCatalog,
    private readonly executor: CapsuleCommandExecutor,
    private readonly nameMapper: CapsuleAgentToolNameMapper,
  ) {}

  async executeToolCall(
    call: CapsuleAgentToolCall,
  ): Promise<CapsuleAgentToolResult> {
    const builtin = await this.tryBuiltin(call);
    if (builtin) {
      return builtin;
    }

    const capabilityId = this.nameMapper.capabilityIdFor(call.name);
    if (!capabilityId || !this.catalog.has(capabilityId)) {
      return {
        success: false,
        code: "UNKNOWN_TOOL",
        message: `Unknown tool: ${call.name}`,
      };
    }

    const descriptor = this.catalog.get(capabilityId);
    if (
      descriptor.requiresDocumentId &&
      typeof call.arguments.docId !== "string"
    ) {
      return {
        success: false,
        code: "INVALID_ARGUMENTS",
        message: `${call.name} requires string docId (Convex instance id)`,
      };
    }

    const { idempotencyKey, ...args } = call.arguments;
    try {
      const data = await this.executor.execute({
        capabilityId,
        args,
        ...(typeof idempotencyKey === "string" ? { idempotencyKey } : {}),
      });
      return this.withUiGap(
        {
          success: true,
          data,
          uiImplemented: descriptor.uiImplemented,
        },
        capabilityId,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return this.withUiGap(
        {
          success: false,
          code: "COMMAND_FAILED",
          message,
          uiImplemented: descriptor.uiImplemented,
        },
        capabilityId,
      );
    }
  }

  private withUiGap(
    result: CapsuleAgentToolResult,
    capabilityId: string,
  ): CapsuleAgentToolResult {
    const uiGapWarning = this.uiBanner.forCapability(capabilityId);
    if (!uiGapWarning) {
      return result;
    }
    return { ...result, uiGapWarning };
  }

  private async tryBuiltin(
    call: CapsuleAgentToolCall,
  ): Promise<CapsuleAgentToolResult | null> {
    if (call.name === CapsuleAgentBuiltinToolNames.listCommands) {
      const commands = this.catalog.list();
      const uiGaps = this.catalog.uiGaps();
      const uiGapWarning = this.uiBanner.forCapabilities(uiGaps);
      return {
        success: true,
        data: { commands, uiGaps },
        ...(uiGapWarning ? { uiGapWarning } : {}),
      };
    }

    if (call.name === CapsuleAgentBuiltinToolNames.describeCommand) {
      const capabilityId = call.arguments.capabilityId;
      if (typeof capabilityId !== "string") {
        return {
          success: false,
          code: "INVALID_ARGUMENTS",
          message: "capabilityId string is required",
        };
      }
      try {
        const descriptor = this.catalog.get(capabilityId);
        return this.withUiGap(
          {
            success: true,
            data: descriptor,
            uiImplemented: descriptor.uiImplemented,
          },
          capabilityId,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, code: "UNKNOWN_COMMAND", message };
      }
    }

    return null;
  }
}
