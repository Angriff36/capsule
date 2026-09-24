export type WiringContractDriftInput = {
  pinnedCompilerVersion: string;
  contractCompilerVersion: string;
  copyCompilerVersion: string;
  contractContentHash: string;
  bindingsContractHash: string;
  capabilityIds: ReadonlySet<string>;
  readExportNames: ReadonlySet<string>;
  referencedCapabilityIds: readonly string[];
  referencedReadExports: readonly string[];
};

export type GenerationTreeDriftInput = {
  dirtyManifests: readonly string[];
  dirtyWiring: readonly string[];
};

/**
 * Fast checks that the generated wiring still matches the compiler pin
 * and the screens that read it. Does not regenerate.
 */
export class CapsuleWiringDriftCheck {
  contractProblems(input: WiringContractDriftInput): string[] {
    const problems: string[] = [];
    this.compareCompiler(input, problems);
    this.compareCopies(input, problems);
    this.requireIds(input, problems);
    return problems;
  }

  generationProblems(input: GenerationTreeDriftInput): string[] {
    if (input.dirtyWiring.length > 0) {
      return [
        `generated wiring is not committed: ${input.dirtyWiring.join(", ")}`,
      ];
    }
    if (input.dirtyManifests.length > 0) {
      return [
        `manifest source changed but wiring was not regenerated: ${input.dirtyManifests.join(", ")}`,
      ];
    }
    return [];
  }

  private compareCompiler(
    input: WiringContractDriftInput,
    problems: string[],
  ): void {
    if (input.contractCompilerVersion !== input.pinnedCompilerVersion) {
      problems.push(
        `wiring compiler ${input.contractCompilerVersion} does not match pin ${input.pinnedCompilerVersion}`,
      );
    }
    if (input.copyCompilerVersion !== input.contractCompilerVersion) {
      problems.push(
        `wiring/contract.json compiler ${input.copyCompilerVersion} does not match the generated contract`,
      );
    }
  }

  private compareCopies(
    input: WiringContractDriftInput,
    problems: string[],
  ): void {
    if (input.bindingsContractHash !== input.contractContentHash) {
      problems.push(
        "generated bindings hash does not match the wiring contract",
      );
    }
  }

  private requireIds(
    input: WiringContractDriftInput,
    problems: string[],
  ): void {
    for (const id of input.referencedCapabilityIds) {
      if (!input.capabilityIds.has(id)) {
        problems.push(`missing capability ${id}`);
      }
    }
    for (const exportName of input.referencedReadExports) {
      if (!input.readExportNames.has(exportName)) {
        problems.push(`missing read ${exportName}`);
      }
    }
  }
}
