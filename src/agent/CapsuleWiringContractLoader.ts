import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CapsuleWiringCapabilityRecord {
  capabilityId: string;
  entity: string;
  command: string;
  route: string;
  instanceCommand?: boolean;
  clientParameterNames: string[];
  parameters: Array<{
    name: string;
    tsType: string;
    required: boolean;
    ownership: string;
    irTypeName?: string;
    nullable?: boolean;
    constraints?: {
      enumValues?: string[];
      min?: number;
      max?: number;
      dateLike?: boolean;
      rejectEmptyString?: boolean;
    };
  }>;
  emits: string[];
}

export interface CapsuleWiringContractFile {
  capabilities: CapsuleWiringCapabilityRecord[];
}

export interface CapsuleWiringContractSnapshot {
  contract: CapsuleWiringContractFile;
  mtimeMs: number;
  path: string;
}

/**
 * Loads Manifest wiring contract from disk with mtime for cache invalidation.
 * Long-lived MCP hosts must not freeze the static JSON import forever (#16).
 */
export class CapsuleWiringContractLoader {
  private readonly contractPath: string;

  constructor(contractPath?: string) {
    this.contractPath =
      contractPath ??
      join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "generated",
        "manifest-wiring-contract.json",
      );
  }

  path(): string {
    return this.contractPath;
  }

  load(): CapsuleWiringContractSnapshot {
    const mtimeMs = statSync(this.contractPath).mtimeMs;
    const contract = JSON.parse(
      readFileSync(this.contractPath, "utf8"),
    ) as CapsuleWiringContractFile;
    if (!Array.isArray(contract.capabilities)) {
      throw new Error(
        `Wiring contract missing capabilities array: ${this.contractPath}`,
      );
    }
    return { contract, mtimeMs, path: this.contractPath };
  }
}
