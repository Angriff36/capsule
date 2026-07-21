import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Indexes generated Convex mutation export names from `convex/mutations.ts`.
 * Used to resolve wiring capabilityIds → live mutation symbols without a
 * hand-maintained allowlist.
 */
export class CapsuleMutationExportIndex {
  private readonly names: ReadonlySet<string>;

  constructor(
    names: ReadonlySet<string> = CapsuleMutationExportIndex.loadFromMutationsFile(),
  ) {
    this.names = names;
  }

  has(mutationName: string): boolean {
    return this.names.has(mutationName);
  }

  static loadFromMutationsFile(
    mutationsPath: string = resolve(process.cwd(), "convex/mutations.ts"),
  ): ReadonlySet<string> {
    if (!existsSync(mutationsPath)) {
      throw new Error(
        `Cannot index Convex mutations — missing ${mutationsPath}`,
      );
    }
    const text = readFileSync(mutationsPath, "utf8");
    return new Set(
      [...text.matchAll(/^export const (\w+) = /gm)].map((m) => m[1]!),
    );
  }
}
