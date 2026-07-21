import type { CapsuleCommandCatalog } from "../CapsuleCommandCatalog";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { CapsuleAgentToolBridge } from "./CapsuleAgentToolBridge";
import type {
  CapsuleAgentToolResult,
  CapsuleLlmToolFormat,
} from "./CapsuleAgentToolTypes";

/**
 * Programmatic consumer: load LLM tool defs and execute snake-named calls
 * through the Capsule Convex command bridge.
 */
export class CapsuleLlmToolDriver {
  private readonly bridge: CapsuleAgentToolBridge;

  constructor(
    executor: CapsuleCommandExecutor,
    catalog?: CapsuleCommandCatalog,
  ) {
    this.bridge = new CapsuleAgentToolBridge(executor, catalog);
  }

  listToolDefinitions(format: CapsuleLlmToolFormat = "anthropic") {
    return this.bridge.getToolDefinitions(format);
  }

  async runToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CapsuleAgentToolResult> {
    return this.bridge.executeToolCall({ name, arguments: args });
  }
}
