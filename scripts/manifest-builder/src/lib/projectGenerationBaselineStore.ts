/**
 * Content-addressed store for previously generated Builder baseline bytes.
 * Digests alone cannot produce diffs — exact prior content lives here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  existsPath,
  hashContent,
  readPathIfPresent,
  resolveTargetPath,
} from "./projectGenerationPaths";

export const BASELINE_STORE_DIR = ".builder/baselines";

export function baselineBlobPath(digest: string): string {
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`Invalid baseline digest: ${digest}`);
  }
  return `${BASELINE_STORE_DIR}/${digest}`;
}

export class ProjectGenerationBaselineStore {
  constructor(private readonly targetDir: string) {}

  async read(digest: string): Promise<string | null> {
    return readPathIfPresent(
      resolveTargetPath(this.targetDir, baselineBlobPath(digest)),
    );
  }

  async write(content: string): Promise<string> {
    const digest = hashContent(content);
    const relative = baselineBlobPath(digest);
    const absolute = resolveTargetPath(this.targetDir, relative);
    if (await existsPath(absolute)) return digest;
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
    return digest;
  }

  async writeMany(blobs: ReadonlyMap<string, string>): Promise<void> {
    for (const [digest, content] of blobs) {
      if (hashContent(content) !== digest) {
        throw new Error(`Baseline blob digest mismatch for ${digest}`);
      }
      const absolute = resolveTargetPath(
        this.targetDir,
        baselineBlobPath(digest),
      );
      if (await existsPath(absolute)) continue;
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
    }
  }
}
