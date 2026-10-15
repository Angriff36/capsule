import type { CheckChangeSet } from "./CheckChangeSet";

export type SkipDecision = { skip: false } | { skip: true; reason: string };

/**
 * Specialized checks skip only when the change set proves they cannot fire.
 * Always-on gates (toolchain, secrets, format, ownership, typecheck, tests,
 * UI build) are not listed here.
 */
export class CheckSkipPolicy {
  constructor(private readonly changes: CheckChangeSet) {}

  storybook(): SkipDecision {
    return this.decide(
      "storybook",
      (path) =>
        path === "package.json" ||
        path === "bun.lock" ||
        path.startsWith(".storybook/") ||
        path.startsWith("src/ui/") ||
        path.startsWith("src/styles/") ||
        path.startsWith("ui-library/") ||
        /\.stories\.[cm]?[jt]sx?$/.test(path) ||
        this.changes.storyDirectories.has(directoryOf(path)),
    );
  }

  designVocab(): SkipDecision {
    return this.decide(
      "design-vocab",
      (path) =>
        path === "DESIGN.md" ||
        path === "design-contract-exceptions.json" ||
        path === "scripts/check-design-vocab.ts" ||
        path.startsWith("src/styles/") ||
        isSrcScanTarget(path),
    );
  }

  /** fmt and scan only need authored Manifest files. */
  manifestFmtScan(): SkipDecision {
    return this.decide(
      "manifest fmt/scan",
      (path) => path.endsWith(".manifest") || path === "manifest.config.yaml",
    );
  }

  manifestBreaking(): SkipDecision {
    return this.decide(
      "manifest-breaking",
      (path) =>
        path.endsWith(".manifest") ||
        path === "manifest.config.yaml" ||
        path === "scripts/manifest-breaking-acks.json" ||
        path === "scripts/check-manifest-breaking.ts" ||
        path.startsWith("scripts/manifest-builder/") ||
        path === "package.json" ||
        path === "bun.lock",
    );
  }

  manifestRegistry(): SkipDecision {
    return this.decide(
      "manifest-registry",
      (path) =>
        path === "package.json" ||
        path === "bun.lock" ||
        path === "scripts/check-manifest-registry-pin.ts",
    );
  }

  private decide(
    label: string,
    isRelevant: (path: string) => boolean,
  ): SkipDecision {
    if (!this.changes.proven) {
      return { skip: false };
    }
    if (this.changes.touches(isRelevant)) return { skip: false };
    const since = this.changes.base.slice(0, 9);
    return {
      skip: true,
      reason: `${label} skipped: no affecting files since ${since}`,
    };
  }
}

function directoryOf(path: string): string {
  const slash = path.replace(/\\/g, "/").lastIndexOf("/");
  return slash <= 0 ? "" : path.slice(0, slash);
}

function isSrcScanTarget(path: string): boolean {
  if (!path.startsWith("src/")) return false;
  return /\.(tsx?|css)$/.test(path);
}
