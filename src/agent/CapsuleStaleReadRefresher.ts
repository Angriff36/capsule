import { CapsuleGeneratedReadCatalog } from "./CapsuleGeneratedReadCatalog";
import { CapsuleGeneratedWiringFacts } from "./CapsuleGeneratedWiringFacts";

export interface CapsuleQueryRefetch {
  refetch(exportName: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * After a command succeeds, re-fetches the generated stale reads that
 * do not need an id. List reads of the changed record and of related
 * records both go through the existing query client.
 */
export class CapsuleStaleReadRefresher {
  constructor(
    private readonly queries: CapsuleQueryRefetch,
    private readonly facts: CapsuleGeneratedWiringFacts = new CapsuleGeneratedWiringFacts(),
    private readonly reads: CapsuleGeneratedReadCatalog = new CapsuleGeneratedReadCatalog(),
  ) {}

  staleReadIds(capabilityId: string): string[] {
    return this.facts.staleReadIds(capabilityId);
  }

  async afterSuccess<T>(capabilityId: string, data: T): Promise<T> {
    await this.refresh(capabilityId);
    return data;
  }

  async refresh(capabilityId: string): Promise<string[]> {
    const refreshed: string[] = [];
    for (const readId of this.staleReadIds(capabilityId)) {
      const read = this.reads.byReadId(readId);
      if (read.parameters.some((parameter) => parameter.required)) continue;
      await this.queries.refetch(
        read.exportName,
        this.reads.argumentsFor(read.exportName, {}),
      );
      refreshed.push(readId);
    }
    return refreshed;
  }
}
