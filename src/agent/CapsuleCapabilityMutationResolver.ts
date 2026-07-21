import { CapsuleMutationExportIndex } from "./CapsuleMutationExportIndex";

/**
 * Resolves Manifest wiring `Entity.command` → Convex mutation export name.
 * Prefers `Entity_createViaCommand` when both createVia and instance exports
 * exist (createVia is the client create path; no docId).
 */
export class CapsuleCapabilityMutationResolver {
  constructor(
    private readonly exports: CapsuleMutationExportIndex = new CapsuleMutationExportIndex(),
  ) {}

  resolve(capabilityId: string): string {
    const dot = capabilityId.indexOf(".");
    if (dot <= 0 || dot === capabilityId.length - 1) {
      throw new Error(`Invalid capabilityId '${capabilityId}'`);
    }
    const entity = capabilityId.slice(0, dot);
    const command = capabilityId.slice(dot + 1);
    const pascal = command[0]!.toUpperCase() + command.slice(1);
    const createVia = `${entity}_createVia${pascal}`;
    const direct = `${entity}_${command}`;
    if (this.exports.has(createVia)) return createVia;
    if (this.exports.has(direct)) return direct;
    throw new Error(
      `No Convex mutation for '${capabilityId}' (tried ${createVia}, ${direct}).`,
    );
  }
}
