import wiringContract from "../generated/manifest-wiring-contract.json";
import { mutationNameForCapability } from "./CapsuleCommandMutationMap";
import {
  CapsuleCommandUiCoverage,
  type CapsuleCommandUiSurface,
} from "./CapsuleCommandUiCoverage";
import { CapsuleMutationTargetKind } from "./llm/CapsuleMutationTargetKind";
import { listWiringCapabilityIds } from "./CapsuleWiringCapabilityIds";

export interface CapsuleCommandParameterConstraints {
  enumValues?: string[];
  min?: number;
  max?: number;
  dateLike?: boolean;
  rejectEmptyString?: boolean;
}

export interface CapsuleCommandParameter {
  name: string;
  tsType: string;
  required: boolean;
  ownership: string;
  irTypeName?: string;
  nullable?: boolean;
  constraints?: CapsuleCommandParameterConstraints;
}

export interface CapsuleCommandDescriptor {
  capabilityId: string;
  entity: string;
  command: string;
  route: string;
  mutationName: string;
  /** True when Convex mutation expects docId (non-createVia instance command). */
  requiresDocumentId: boolean;
  /** False when agent/backend can run it but no Capsule screen calls it yet. */
  uiImplemented: boolean;
  uiSurface: CapsuleCommandUiSurface | null;
  clientParameterNames: string[];
  parameters: CapsuleCommandParameter[];
  emits: string[];
}

interface WiringCapability {
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
    constraints?: CapsuleCommandParameterConstraints;
  }>;
  emits: string[];
}

interface WiringContractFile {
  capabilities: WiringCapability[];
}

/**
 * Discoverable command contract for agents — every wiring capability that
 * resolves to a Convex mutation (full Manifest surface, not a lazy subset).
 */
export class CapsuleCommandCatalog {
  private readonly byId: Map<string, CapsuleCommandDescriptor>;
  private readonly uiCoverage: CapsuleCommandUiCoverage;

  constructor(
    contract: WiringContractFile = wiringContract as WiringContractFile,
    capabilityIds: readonly string[] = listWiringCapabilityIds(contract),
    uiCoverage: CapsuleCommandUiCoverage = new CapsuleCommandUiCoverage(),
  ) {
    this.uiCoverage = uiCoverage;
    this.uiCoverage.assertAcSurfacesRecorded();
    this.byId = new Map();
    for (const id of capabilityIds) {
      const raw = contract.capabilities.find((c) => c.capabilityId === id);
      if (!raw) {
        throw new Error(
          `Wiring contract missing capability '${id}' — regenerate Manifest wiring.`,
        );
      }
      const mutationName = mutationNameForCapability(raw.capabilityId);
      const uiSurface = this.uiCoverage.surface(raw.capabilityId);
      this.byId.set(id, {
        capabilityId: raw.capabilityId,
        entity: raw.entity,
        command: raw.command,
        route: raw.route,
        mutationName,
        requiresDocumentId:
          CapsuleMutationTargetKind.requiresDocumentId(mutationName),
        uiImplemented: uiSurface != null,
        uiSurface,
        clientParameterNames: raw.clientParameterNames,
        parameters: raw.parameters.map((p) => ({
          name: p.name,
          tsType: p.tsType,
          required: p.required,
          ownership: p.ownership,
          irTypeName: p.irTypeName,
          nullable: p.nullable,
          constraints: p.constraints,
        })),
        emits: raw.emits,
      });
    }
  }

  /** Capabilities with no authored UI call site. */
  uiGaps(): string[] {
    return this.uiCoverage.gaps(this.list().map((c) => c.capabilityId));
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
