import { mangleToolName } from "@angriff36/manifest/agent-sdk";
import type { CapsuleCommandDescriptor } from "../CapsuleCommandCatalog";

/**
 * Maps AC capability descriptors ↔ LLM tool names (agent-sdk mangling).
 */
export class CapsuleAgentToolNameMapper {
  private readonly toolNameToCapabilityId: Map<string, string>;
  private readonly capabilityIdToToolName: Map<string, string>;

  constructor(
    descriptors: readonly CapsuleCommandDescriptor[],
    strategy: "snake" | "dot" = "snake",
  ) {
    this.toolNameToCapabilityId = new Map();
    this.capabilityIdToToolName = new Map();
    for (const descriptor of descriptors) {
      const toolName = mangleToolName(
        descriptor.entity,
        descriptor.command,
        strategy,
      );
      this.toolNameToCapabilityId.set(toolName, descriptor.capabilityId);
      this.capabilityIdToToolName.set(descriptor.capabilityId, toolName);
    }
  }

  toolNameFor(capabilityId: string): string {
    const name = this.capabilityIdToToolName.get(capabilityId);
    if (!name) {
      throw new Error(`No LLM tool name for capability '${capabilityId}'.`);
    }
    return name;
  }

  capabilityIdFor(toolName: string): string | undefined {
    return this.toolNameToCapabilityId.get(toolName);
  }
}
