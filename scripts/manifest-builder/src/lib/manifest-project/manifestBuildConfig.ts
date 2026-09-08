/**
 * Loads build-level Manifest config and resolves projection options via
 * Manifest's public `@angriff36/manifest/config` API.
 */
import { parse as parseYaml } from "yaml";
import {
  resolveProjectionOptions,
  type ManifestBuildConfig,
} from "@angriff36/manifest/config";

export class ManifestBuildConfigLoader {
  loadFromContent(
    configPath: string | null,
    content: string | null,
  ): ManifestBuildConfig {
    if (!configPath || content === null) return {};
    if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
      return this.loadYaml(content);
    }
    if (configPath.endsWith(".ts") || configPath.endsWith(".js")) {
      throw new Error(
        `${configPath} requires runtime evaluation; place build settings in manifest.config.yaml for Capsule generation.`,
      );
    }
    return {};
  }

  projectionOptions(
    build: ManifestBuildConfig,
    projectionName: string,
  ): Record<string, unknown> {
    return resolveProjectionOptions(build, projectionName);
  }

  private loadYaml(content: string): ManifestBuildConfig {
    const parsed: unknown = parseYaml(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("manifest.config.yaml must contain a YAML object");
    }
    return parsed as ManifestBuildConfig;
  }
}
