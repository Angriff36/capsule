/**
 * Loads Capsule-owned editable Manifest source + config from a directory tree.
 * Does not compile or project — filesystem inventory only.
 */
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const MANIFEST_CONFIG_CANDIDATES = [
  "manifest.config.ts",
  "manifest.config.js",
  "manifest.config.yaml",
  "manifest.config.yml",
] as const;

export type ManifestConfigFileName =
  (typeof MANIFEST_CONFIG_CANDIDATES)[number];

export interface ManifestSourceTreeSnapshot {
  /** Directory the tree was loaded from. */
  rootDir: string;
  /** Relative POSIX paths → file contents for .manifest sources. */
  sources: Record<string, string>;
  /** Relative config path when present. */
  configPath: string | null;
  /** Config file contents when present. */
  configContent: string | null;
  /** Every editable path (sources + config). */
  editablePaths: string[];
  /** Map of all editable relative paths → contents. */
  editableFiles: Map<string, string>;
}

export class ManifestSourceTree {
  constructor(private readonly rootDir: string) {}

  async load(): Promise<ManifestSourceTreeSnapshot> {
    const sources: Record<string, string> = {};
    const editableFiles = new Map<string, string>();

    for (const relativePath of await this.listFiles(this.rootDir)) {
      const normalized = relativePath.replace(/\\/g, "/");
      if (!normalized.endsWith(".manifest")) continue;
      if (normalized.split("/").includes("node_modules")) continue;
      if (normalized.startsWith("generated/")) continue;
      const content = await readFile(
        join(this.rootDir, ...normalized.split("/")),
        "utf8",
      );
      sources[normalized] = content;
      editableFiles.set(normalized, content);
    }

    let configPath: string | null = null;
    let configContent: string | null = null;
    for (const candidate of MANIFEST_CONFIG_CANDIDATES) {
      const absolute = join(this.rootDir, candidate);
      if (!(await this.exists(absolute))) continue;
      configPath = candidate;
      configContent = await readFile(absolute, "utf8");
      editableFiles.set(candidate, configContent);
      break;
    }

    const editablePaths = [...editableFiles.keys()].sort();
    return {
      rootDir: this.rootDir,
      sources,
      configPath,
      configContent,
      editablePaths,
      editableFiles,
    };
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async listFiles(root: string, prefix = ""): Promise<string[]> {
    if (!(await this.exists(root))) return [];
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      // .loop-worktrees = Capsule agent worktrees (gitignored). Including them
      // feeds duplicate .manifest graphs into compile and false "circular" errors.
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".artifacts" ||
        entry.name === "scripts" ||
        entry.name === ".loop-worktrees" ||
        entry.name === "fixtures" ||
        entry.name === "docs" ||
        entry.name === "generated"
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        files.push(
          ...(await this.listFiles(join(root, entry.name), relativePath)),
        );
      } else {
        files.push(relativePath.replace(/\\/g, "/"));
      }
    }
    return files.sort();
  }
}
