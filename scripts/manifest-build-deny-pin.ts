/**
 * Capsule intentionally replaces Builder-emitted `manifest:build` with a
 * deny-guard. Builder apply rewrites package.json scripts — re-pin after regen
 * and keep ownership.package.scripts aligned so pre-push stays green.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MANIFEST_BUILD_DENY_SCRIPT = "bun scripts/manifest-build-deny.ts";

type PackageJson = {
  scripts?: Record<string, string>;
};

type OwnershipFile = {
  files?: Record<string, { sha256?: string; baselined?: boolean }>;
  package?: {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
};

export class ManifestBuildDenyPin {
  constructor(private readonly capsuleRoot: string) {}

  /** True when package.json already points at the deny shim. */
  isPinned(): boolean {
    return (
      this.readPackage().scripts?.["manifest:build"] ===
      MANIFEST_BUILD_DENY_SCRIPT
    );
  }

  /** Rewrite package.json + ownership ledger for the deny shim. */
  ensurePinned(): void {
    const pkgPath = join(this.capsuleRoot, "package.json");
    const pkg = this.readPackage();
    pkg.scripts = pkg.scripts ?? {};
    if (pkg.scripts["manifest:build"] !== MANIFEST_BUILD_DENY_SCRIPT) {
      pkg.scripts["manifest:build"] = MANIFEST_BUILD_DENY_SCRIPT;
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    }

    const ownershipPath = join(this.capsuleRoot, ".builder", "ownership.json");
    const ownership = JSON.parse(
      readFileSync(ownershipPath, "utf8"),
    ) as OwnershipFile;
    ownership.files = ownership.files ?? {};
    ownership.package = ownership.package ?? {};
    ownership.package.scripts = ownership.package.scripts ?? {};
    ownership.package.scripts["manifest:build"] = MANIFEST_BUILD_DENY_SCRIPT;

    const digest = createHash("sha256")
      .update(readFileSync(pkgPath))
      .digest("hex");
    const prior = ownership.files["package.json"] ?? {};
    ownership.files["package.json"] = {
      ...prior,
      sha256: digest,
      baselined: true,
    };
    writeFileSync(
      ownershipPath,
      `${JSON.stringify(ownership, null, 2)}\n`,
      "utf8",
    );
  }

  private readPackage(): PackageJson {
    return JSON.parse(
      readFileSync(join(this.capsuleRoot, "package.json"), "utf8"),
    ) as PackageJson;
  }
}
