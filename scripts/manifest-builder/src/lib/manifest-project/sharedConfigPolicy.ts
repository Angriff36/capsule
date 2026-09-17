/**
 * Shared project-config policy for Capsule-style regeneration.
 *
 * - Update mode never replaces application-owned tsconfig.json; Builder owns
 *   tsconfig.builder.json instead.
 * - When Vite already configures Vitest, do not emit a competing vitest.config.*.
 * - Relinquished paths leave ownership without deleting on-disk files.
 */
import {
  existsPath,
  normalizeRelativePath,
  readPathIfPresent,
  resolveTargetPath,
} from "../projectGenerationPaths";
import type { GeneratedFileMap } from "../projectGenerationTypes";

export const TSCONFIG_APP_PATH = "tsconfig.json";
export const TSCONFIG_BUILDER_PATH = "tsconfig.builder.json";
export const VITEST_CONFIG_PATH = "vitest.config.ts";

const VITE_CONFIG_CANDIDATES = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
] as const;

export interface SharedConfigPrepareRequest {
  mode: "initial" | "update";
  targetDir: string;
  files: GeneratedFileMap;
}

export interface SharedConfigPrepareResult {
  files: GeneratedFileMap;
  /** Previously Builder-owned paths that must stay on disk but leave ownership. */
  relinquishOwnership: string[];
}

export class SharedConfigPolicy {
  async prepare(
    request: SharedConfigPrepareRequest,
  ): Promise<SharedConfigPrepareResult> {
    const files = new Map(request.files);
    const relinquish = new Set<string>();

    if (request.mode === "update") {
      if (files.has(TSCONFIG_APP_PATH)) {
        files.delete(TSCONFIG_APP_PATH);
      }
      relinquish.add(TSCONFIG_APP_PATH);
    }

    if (
      files.has(VITEST_CONFIG_PATH) &&
      (await this.targetOwnsVitestViaVite(request.targetDir))
    ) {
      files.delete(VITEST_CONFIG_PATH);
      relinquish.add(VITEST_CONFIG_PATH);
    }

    return {
      files,
      relinquishOwnership: [...relinquish].sort(),
    };
  }

  viteConfigOwnsVitest(content: string): boolean {
    return (
      /from\s+['"]vitest\/config['"]/.test(content) ||
      /require\(\s*['"]vitest\/config['"]\s*\)/.test(content) ||
      /\btest\s*:\s*\{/.test(content)
    );
  }

  private async targetOwnsVitestViaVite(targetDir: string): Promise<boolean> {
    for (const candidate of VITE_CONFIG_CANDIDATES) {
      const absolute = resolveTargetPath(
        targetDir,
        normalizeRelativePath(candidate),
      );
      if (!(await existsPath(absolute))) continue;
      const content = await readPathIfPresent(absolute);
      if (content !== null && this.viteConfigOwnsVitest(content)) return true;
    }
    return false;
  }
}
