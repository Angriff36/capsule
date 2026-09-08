/**
 * @angriff36/manifest version/range installed by Builder.
 * Sourced from Capsule root package.json dependencies['@angriff36/manifest'].
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** Manifest semver requirement Builder depends on (registry range, not file:). */
export function installedManifestVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  return pkg.dependencies["@angriff36/manifest"];
}
