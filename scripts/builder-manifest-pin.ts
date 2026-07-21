/**
 * Capsule regen runs Builder as a sibling tool. Builder's node_modules
 * `@angriff36/manifest` is what actually compiles/projects — so Capsule's
 * pin must be installed into that sibling before generate, without any
 * GitHub PAT / cross-repo secret.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEP = "@angriff36/manifest";

export class BuilderManifestPinSync {
  constructor(
    private readonly capsuleRoot: string,
    private readonly builderDir: string,
  ) {}

  readCapsulePin(): string | null {
    return (
      this.readExactPin(join(this.capsuleRoot, "package.json")) ??
      this.readLockedRegistryVersion(this.capsuleRoot)
    );
  }

  readBuilderPin(): string | null {
    return this.readExactPin(join(this.builderDir, "package.json"));
  }

  /** Installed package version under Builder node_modules (what compiles). */
  readBuilderInstalledVersion(): string | null {
    const installedPkg = join(
      this.builderDir,
      "node_modules",
      "@angriff36",
      "manifest",
      "package.json",
    );
    if (!existsSync(installedPkg)) return null;
    try {
      const pkg = JSON.parse(readFileSync(installedPkg, "utf8")) as {
        version?: string;
      };
      return typeof pkg.version === "string" &&
        /^\d+\.\d+\.\d+$/.test(pkg.version)
        ? pkg.version
        : null;
    } catch {
      return null;
    }
  }

  /** Returns true when Builder was already on Capsule's pin (no install). */
  ensureBuilderMatchesCapsule(): boolean {
    const pin = this.readCapsulePin();
    if (!pin) {
      console.warn(
        `Capsule package.json has no exact ${DEP} pin; skipping Builder Manifest sync.`,
      );
      return true;
    }
    const builderPkg = join(this.builderDir, "package.json");
    if (!existsSync(builderPkg)) {
      throw new Error(`Builder package.json missing at ${builderPkg}`);
    }
    const declared = this.readBuilderPin();
    const installed = this.readBuilderInstalledVersion();
    // package.json match alone is insufficient — regen uses node_modules.
    if (declared === pin && installed === pin) {
      return true;
    }
    console.log(
      `Syncing sibling Builder ${DEP}: declared=${declared ?? "(missing)"} installed=${installed ?? "(missing)"} -> ${pin}`,
    );
    const bumpScript = join(
      this.builderDir,
      "scripts",
      "bump-manifest-pin.mjs",
    );
    if (existsSync(bumpScript)) {
      const bump = spawnSync("node", [bumpScript, builderPkg, pin], {
        cwd: this.builderDir,
        stdio: "inherit",
      });
      if (bump.status !== 0) {
        throw new Error(`Failed to bump Builder ${DEP} pin to ${pin}`);
      }
    } else {
      this.writePinFallback(builderPkg, pin);
    }
    const install = spawnSync(
      "npm",
      ["install", `${DEP}@${pin}`, "--no-fund", "--no-audit"],
      {
        cwd: this.builderDir,
        stdio: "inherit",
        shell: true,
      },
    );
    if (install.status !== 0) {
      throw new Error(
        `Failed to install ${DEP}@${pin} into Builder at ${this.builderDir}`,
      );
    }
    return false;
  }

  private readExactPin(packageJsonPath: string): string | null {
    if (!existsSync(packageJsonPath)) return null;
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const raw = pkg.dependencies?.[DEP] ?? pkg.devDependencies?.[DEP];
    if (!raw || !/^\d+\.\d+\.\d+$/.test(raw)) return null;
    return raw;
  }

  /** Resolve caret/range pins via bun.lock so regen still syncs Builder. */
  private readLockedRegistryVersion(root: string): string | null {
    const lockPath = join(root, "bun.lock");
    if (!existsSync(lockPath)) return null;
    const match = readFileSync(lockPath, "utf8").match(
      /"@angriff36\/manifest@(\d+\.\d+\.\d+)"/,
    );
    return match?.[1] ?? null;
  }

  private writePinFallback(packageJsonPath: string, version: string): void {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (pkg.dependencies?.[DEP] != null) {
      pkg.dependencies[DEP] = version;
    } else if (pkg.devDependencies?.[DEP] != null) {
      pkg.devDependencies[DEP] = version;
    } else {
      throw new Error(`Builder package.json has no ${DEP} dependency`);
    }
    writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  }
}
