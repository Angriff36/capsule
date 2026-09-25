/**
 * Content-addressed store for previously generated Builder baseline bytes.
 * Digests alone cannot produce diffs — exact prior content lives here.
 */
import type { Dirent } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  existsPath,
  hashContent,
  readPathIfPresent,
  resolveTargetPath,
} from "./projectGenerationPaths";

export const BASELINE_STORE_DIR = ".builder/baselines";

const BASELINE_DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export function isBaselineDigest(value: string): boolean {
  return BASELINE_DIGEST_PATTERN.test(value);
}

export function baselineBlobPath(digest: string): string {
  if (!isBaselineDigest(digest)) {
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

  /**
   * Digests currently stored on disk. Only regular files with a digest name
   * count — non-digest names and digest-named directories are ignored (a
   * directory would otherwise fail the apply transaction's file backup).
   * Missing dir → [].
   */
  async listDigests(): Promise<string[]> {
    const directory = resolveTargetPath(this.targetDir, BASELINE_STORE_DIR);
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return entries
      .filter((entry) => entry.isFile() && isBaselineDigest(entry.name))
      .map((entry) => entry.name)
      .sort();
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
