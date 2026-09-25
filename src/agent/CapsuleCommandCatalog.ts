import type {
  WiringActionPresentation,
  WiringCommandDescriptor,
  WiringInvalidationTarget,
} from "@angriff36/manifest/projections/wiring";
import wiringContract from "../generated/manifest-wiring-contract.json";
import { CapsuleGeneratedWiringFacts } from "./CapsuleGeneratedWiringFacts";
import { mutationNameForCapability } from "./CapsuleCommandMutationMap";

type WiringFailureRule = WiringCommandDescriptor["failures"][number];
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
  resultKind: "created" | "allocation" | "instance" | "empty";
  failures: WiringFailureRule[];
  invalidation: WiringInvalidationTarget[];
  serverParameterNames: string[];
  presentation: WiringActionPresentation;
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
  private readonly wiringFacts: CapsuleGeneratedWiringFacts;

  constructor(
    contract: WiringContractFile = wiringContract as WiringContractFile,
    capabilityIds: readonly string[] = listWiringCapabilityIds(contract),
    uiCoverage: CapsuleCommandUiCoverage = new CapsuleCommandUiCoverage(),
  ) {
    this.uiCoverage = uiCoverage;
    this.wiringFacts = new CapsuleGeneratedWiringFacts();
    this.uiCoverage.assertAcSurfacesRecorded();
    this.byId = new Map();
    for (const id of capabilityIds) {
      const generated = this.generatedCommand(id);
      const mutationName = mutationNameForCapability(generated.capabilityId);
      const uiSurface = this.uiCoverage.surface(generated.capabilityId);
      this.byId.set(id, {
        capabilityId: generated.capabilityId,
        entity: generated.entity,
        command: generated.command,
        route: generated.route,
        mutationName,
        requiresDocumentId:
          CapsuleMutationTargetKind.requiresDocumentId(mutationName),
        uiImplemented: uiSurface != null,
        uiSurface,
        clientParameterNames: generated.clientParameterNames,
        parameters: generated.parameters.map((parameter) => ({
          name: parameter.name,
          tsType: parameter.tsType,
          required: parameter.required,
          ownership: parameter.ownership,
          irTypeName: parameter.irTypeName,
          nullable: parameter.nullable,
          constraints: parameter.constraints,
        })),
        emits: generated.emits,
        resultKind: generated.resultKind,
        failures: generated.failures,
        invalidation: generated.invalidation,
        serverParameterNames: generated.serverParameterNames,
        presentation: generated.presentation,
      });
    }
  }

  private generatedCommand(capabilityId: string) {
    try {
      return this.wiringFacts.command(capabilityId);
    } catch {
      throw new Error(
        `Wiring contract missing capability '${capabilityId}' — regenerate Manifest wiring.`,
      );
    }
  }

  /** Capabilities with no authored UI call site. */
  uiGaps(): string[] {
    return this.uiCoverage.gaps(
      this.offeredToPeople().map((c) => c.capabilityId),
    );
  }

  list(): CapsuleCommandDescriptor[] {
    return [...this.byId.values()].sort((a, b) =>
      a.capabilityId.localeCompare(b.capabilityId),
    );
  }

  /** Actions a person may be offered. Internal commands stay callable via get(). */
  offeredToPeople(): CapsuleCommandDescriptor[] {
    const offered = this.wiringFacts.offeredCapabilityIds();
    return this.list().filter((descriptor) =>
      offered.has(descriptor.capabilityId),
    );
  }

  generatedFacts(): CapsuleGeneratedWiringFacts {
    return this.wiringFacts;
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
