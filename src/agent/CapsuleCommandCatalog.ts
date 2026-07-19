import wiringContract from "../generated/manifest-wiring-contract.json";
import {
  AGENT_AC_CAPABILITY_IDS,
  mutationNameForCapability,
} from "./CapsuleCommandMutationMap";

export interface CapsuleCommandParameter {
  name: string;
  tsType: string;
  required: boolean;
  ownership: string;
}

export interface CapsuleCommandDescriptor {
  capabilityId: string;
  entity: string;
  command: string;
  route: string;
  mutationName: string;
  clientParameterNames: string[];
  parameters: CapsuleCommandParameter[];
  emits: string[];
}

interface WiringCapability {
  capabilityId: string;
  entity: string;
  command: string;
  route: string;
  clientParameterNames: string[];
  parameters: Array<{
    name: string;
    tsType: string;
    required: boolean;
    ownership: string;
  }>;
  emits: string[];
}

interface WiringContractFile {
  capabilities: WiringCapability[];
}

/**
 * Discoverable command contract for agents — derived from generated wiring JSON.
 */
export class CapsuleCommandCatalog {
  private readonly byId: Map<string, CapsuleCommandDescriptor>;

  constructor(
    contract: WiringContractFile = wiringContract as WiringContractFile,
    capabilityIds: readonly string[] = AGENT_AC_CAPABILITY_IDS,
  ) {
    this.byId = new Map();
    for (const id of capabilityIds) {
      const raw = contract.capabilities.find((c) => c.capabilityId === id);
      if (!raw) {
        throw new Error(
          `Wiring contract missing capability '${id}' — regenerate Manifest wiring.`,
        );
      }
      this.byId.set(id, {
        capabilityId: raw.capabilityId,
        entity: raw.entity,
        command: raw.command,
        route: raw.route,
        mutationName: mutationNameForCapability(raw.capabilityId),
        clientParameterNames: raw.clientParameterNames,
        parameters: raw.parameters.map((p) => ({
          name: p.name,
          tsType: p.tsType,
          required: p.required,
          ownership: p.ownership,
        })),
        emits: raw.emits,
      });
    }
  }

  list(): CapsuleCommandDescriptor[] {
    return [...this.byId.values()].sort((a, b) =>
      a.capabilityId.localeCompare(b.capabilityId),
    );
  }

  get(capabilityId: string): CapsuleCommandDescriptor {
    const found = this.byId.get(capabilityId);
    if (!found) {
      throw new Error(
        `Capability '${capabilityId}' is not in the agent command catalog.`,
      );
    }
    return found;
  }

  has(capabilityId: string): boolean {
    return this.byId.has(capabilityId);
  }
}
