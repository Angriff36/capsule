/**
 * Versioned Convex application preset.
 *
 * Assembles an application contract from Manifest-published proofs.
 * Requirements are discovered; `complete` is derived from
 * `verifyConvexApplicationAssembly`, never forced.
 */

import type { IR } from "./types";
import {
  generateProjection,
  type GenerateResult,
  type GeneratedArtifact,
} from "./generate";
import { buildProjectWiringContract, inspectProjectWiring } from "./wiring";
import {
  CONVEX_ASSEMBLY_REQUIRED_COMPANIONS,
  buildSeedTemplate,
  describeConvexSeedBinding,
  generateConvexSeedScript,
  verifyConvexApplicationAssembly,
  type ConvexAssemblyVerification,
  type ConvexSeedBinding,
} from "./convexAssembly";
import {
  requirementMatrix,
  resolvedConvexSurfaces,
  type PresetRequirement,
  type PresetRequirementStatus,
} from "./convexPresetRequirements";
import { installedManifestVersion } from "./installedManifestVersion";
import {
  CONVEX_AUTH_CONTEXT_IMPORT,
  CONVEX_AUTH_CONTEXT_PATH,
  convexAuthContextSeamSource,
} from "./convexAuthContextSeam";
import {
  CONVEX_ENCRYPTION_IMPORT,
  CONVEX_ENCRYPTION_PATH,
  convexEncryptionSeamSource,
} from "./convexEncryptionSeam";

export {
  requirementMatrix,
  resolvedConvexSurfaces,
  type PresetRequirement,
  type PresetRequirementStatus,
};

export const CONVEX_APPLICATION_PRESET_ID = "convex-application";
/** Preset contract version (Builder). Reconciled against installed Manifest proofs. */
export const CONVEX_APPLICATION_PRESET_VERSION = "1.3.5";

export interface PresetAssembledFile {
  path: string;
  content: string;
  source: string;
}

export interface ConvexApplicationPresetResult {
  presetId: typeof CONVEX_APPLICATION_PRESET_ID;
  version: typeof CONVEX_APPLICATION_PRESET_VERSION;
  complete: boolean;
  requirements: PresetRequirement[];
  files: PresetAssembledFile[];
  dependencies: Record<string, string>;
  envVars: string[];
  errors: string[];
  blockers: string[];
  assemblyVerification?: ConvexAssemblyVerification;
  seedBinding?: ConvexSeedBinding;
  wiringInspect?: {
    ok: boolean;
    unwired: number;
    mismatches: number;
  };
}

function artifactPath(
  artifact: GeneratedArtifact,
  fallbackDir: string,
): string {
  return artifact.pathHint ?? `${fallbackDir}/${artifact.id}.txt`;
}

function collectGeneration(
  ir: IR,
  projection: string,
  surfaces: readonly string[],
  files: PresetAssembledFile[],
  errors: string[],
  assemblyArtifacts: { id: string; code: string }[],
  options?: Record<string, unknown>,
): void {
  for (const surface of surfaces) {
    const result: GenerateResult = generateProjection(ir, projection, surface, {
      invokeWithoutDescriptor: true,
      ...(options ? { options } : {}),
    });
    if (result.blocked || result.error) {
      errors.push(result.error ?? `${projection}/${surface} blocked`);
      continue;
    }
    for (const d of result.diagnostics) {
      if (d.severity === "error")
        errors.push(`${projection}/${surface}: ${d.message}`);
    }
    for (const artifact of result.artifacts) {
      files.push({
        path: artifactPath(artifact, projection),
        content: artifact.code,
        source: `${projection}/${surface}`,
      });
      assemblyArtifacts.push({ id: artifact.id, code: artifact.code });
    }
  }
}

export function describeConvexApplicationPreset(): {
  presetId: typeof CONVEX_APPLICATION_PRESET_ID;
  version: typeof CONVEX_APPLICATION_PRESET_VERSION;
  requirements: PresetRequirement[];
  complete: boolean;
} {
  const requirements = requirementMatrix();
  return {
    presetId: CONVEX_APPLICATION_PRESET_ID,
    version: CONVEX_APPLICATION_PRESET_VERSION,
    requirements,
    complete: requirements.every((r) => r.status === "available"),
  };
}

export interface AssembleConvexApplicationPresetOptions {
  /**
   * Projection options resolved from the target's Manifest config
   * (`resolveProjectionOptions`). Seam imports always win over config.
   *
   * Capsule opt-out: set `skipDocsDiagrams: true` under
   * `projections.convex.options` in `manifest.config.yaml` to stop emitting
   * `diagrams/**` mermaid companions. Manifest still lists `mermaid` as a
   * compatible companion (assembly-verify only checks registry presence);
   * emission is Builder policy.
   */
  convexOptions?: Record<string, unknown>;
}

function skipDocsDiagrams(
  options: AssembleConvexApplicationPresetOptions,
): boolean {
  return options.convexOptions?.skipDocsDiagrams === true;
}

/** Builder-only flags — must not be forwarded into Manifest projection options. */
function manifestConvexOptions(
  options: AssembleConvexApplicationPresetOptions,
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(options.convexOptions ?? {}) };
  delete rest.skipDocsDiagrams;
  delete rest.skipContractTests;
  return rest;
}

/**
 * Assemble the Convex application preset from discovered Manifest capabilities.
 * `complete` is true only when verifyConvexApplicationAssembly passes and generation has no errors.
 */
export function assembleConvexApplicationPreset(
  ir: IR,
  projectName = "convex-app",
  options: AssembleConvexApplicationPresetOptions = {},
): ConvexApplicationPresetResult {
  const requirements = requirementMatrix();
  const blockers = requirements
    .filter((r) => r.status === "blocked")
    .map((r) => `${r.id}: ${r.missing ?? r.detail}`);
  const errors: string[] = [];
  const files: PresetAssembledFile[] = [];
  const assemblyArtifacts: { id: string; code: string }[] = [];

  const available = new Set(
    requirements.filter((r) => r.status === "available").map((r) => r.id),
  );

  // Bundled Zod first so synced-validation is a real module before React wires to it.
  if (available.has("synced-validation")) {
    collectGeneration(
      ir,
      "zod",
      ["zod.schemas"],
      files,
      errors,
      assemblyArtifacts,
    );
  }

  if (available.has("convex-core")) {
    // Tenant + policy IR requires Manifest's authContextImport seam (PB025).
    // Encrypted properties require encryptionImport (Manifest ≥ 3.6.8).
    // Identity/crypto stay in seam modules — never inlined into generated functions.
    // Config-derived options (naming, aliases, storage maps) layer under seams.
    // zodParamsImport: true → convex.react parses via schemas/manifest-schemas (not microfiles).
    collectGeneration(
      ir,
      "convex",
      resolvedConvexSurfaces(),
      files,
      errors,
      assemblyArtifacts,
      {
        ...manifestConvexOptions(options),
        authContextImport: CONVEX_AUTH_CONTEXT_IMPORT,
        encryptionImport: CONVEX_ENCRYPTION_IMPORT,
        ...(available.has("synced-validation")
          ? { zodParamsImport: true }
          : {}),
      },
    );
    files.push({
      path: CONVEX_AUTH_CONTEXT_PATH,
      content: convexAuthContextSeamSource(),
      source: "preset-auth-seam",
    });
    files.push({
      path: CONVEX_ENCRYPTION_PATH,
      content: convexEncryptionSeamSource(),
      source: "preset-encryption-seam",
    });
  } else {
    errors.push(
      "Convex core surfaces unavailable — refusing to invent generators.",
    );
  }

  if (available.has("wiring-contract")) {
    collectGeneration(
      ir,
      "wiring",
      ["wiring.contract", "wiring.bindings"],
      files,
      errors,
      assemblyArtifacts,
    );
    const contract = buildProjectWiringContract(ir);
    files.push({
      path: "wiring/contract.json",
      content: JSON.stringify(contract, null, 2),
      source: "buildProjectWiringContract",
    });
  }

  if (available.has("agent-context")) {
    collectGeneration(
      ir,
      "llm-context",
      ["llm-context.summary"],
      files,
      errors,
      assemblyArtifacts,
    );
  }

  const diagramsSkipped = skipDocsDiagrams(options);
  if (available.has("docs-diagrams") && !diagramsSkipped) {
    collectGeneration(
      ir,
      "mermaid",
      ["mermaid.er", "mermaid.sequence"],
      files,
      errors,
      assemblyArtifacts,
    );
  }

  const contractTestsSkipped =
    options.convexOptions?.skipContractTests === true;
  const hasContractTests = available.has("contract-tests");
  if (hasContractTests && !contractTestsSkipped) {
    collectGeneration(
      ir,
      "contract-tests",
      ["contract-tests.convex"],
      files,
      errors,
      assemblyArtifacts,
    );
  }

  let seedBinding: ConvexSeedBinding | undefined;
  if (available.has("seed-fixtures")) {
    try {
      const pack = buildSeedTemplate(ir, {
        packId:
          projectName.toLowerCase().replace(/[^a-z0-9-]+/g, "-") ||
          "convex-app",
        version: "1.0.0",
        profile: "demo",
      });
      seedBinding = describeConvexSeedBinding(ir, pack);
      const generated = generateConvexSeedScript(ir, pack);
      files.push({
        path: generated.binding.pathHint,
        content: generated.code,
        source: "generateConvexSeedScript",
      });
      assemblyArtifacts.push({
        id: generated.binding.pathHint,
        code: generated.code,
      });
    } catch (e) {
      errors.push(
        `seed-fixtures: ${e instanceof Error ? e.message : "failed to bind Convex seed pack"}`,
      );
    }
  }

  let assemblyVerification: ConvexAssemblyVerification | undefined;
  if (available.has("assembly-verification")) {
    // `ir` is required by Manifest ≥ next patch for event-payload-contract;
    // cast keeps Builder typecheck green while pinned to an older package.
    const verifyArgs = {
      artifacts: assemblyArtifacts,
      ...(seedBinding ? { seedBinding } : {}),
      requireContractTests: !contractTestsSkipped,
      ir,
    };
    assemblyVerification = verifyConvexApplicationAssembly(
      verifyArgs as Parameters<typeof verifyConvexApplicationAssembly>[0],
    );
    if (!assemblyVerification.ok) {
      for (const check of assemblyVerification.checks.filter((c) => !c.pass)) {
        errors.push(`assembly-verification:${check.id}: ${check.detail}`);
      }
    }
  }

  const dependencies: Record<string, string> = {
    "@angriff36/manifest": installedManifestVersion(),
  };
  if (available.has("convex-core")) {
    dependencies.convex = "^1.0.0";
  }
  if (available.has("synced-validation")) {
    dependencies.zod = "^3.23.0";
  }

  const complete =
    blockers.length === 0 &&
    errors.length === 0 &&
    (assemblyVerification?.ok ?? false);

  const pkgName =
    projectName.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "convex-app";
  files.push({
    path: "package.json",
    content: JSON.stringify(
      {
        name: pkgName,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          typecheck: "tsc --noEmit",
          "manifest:compile": "manifest compile --merge",
          "manifest:build": "manifest build",
          ...(hasContractTests ? { test: "vitest run" } : {}),
          ...(available.has("convex-core")
            ? { "dev:convex": "convex dev", deploy: "convex deploy" }
            : {}),
        },
        dependencies,
        devDependencies: {
          typescript: "^5.9.3",
          ...(hasContractTests ? { vitest: "^3.2.4" } : {}),
        },
        manifestPreset: {
          id: CONVEX_APPLICATION_PRESET_ID,
          version: CONVEX_APPLICATION_PRESET_VERSION,
          complete,
          blockers,
        },
      },
      null,
      2,
    ),
    source: "preset-glue",
  });

  // Builder-owned TypeScript base. Application tsconfig.json may extend this;
  // update mode never replaces a customized app tsconfig.json.
  files.push({
    path: "tsconfig.builder.json",
    content: `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          esModuleInterop: true,
          allowJs: false,
          noEmit: true,
          strict: true,
          skipLibCheck: true,
        },
        exclude: ["node_modules", "convex/_generated"],
      },
      null,
      2,
    )}\n`,
    source: "preset-glue",
  });

  files.push({
    path: "tsconfig.json",
    content: `${JSON.stringify(
      {
        extends: "./tsconfig.builder.json",
        compilerOptions: {
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          jsx: "react-jsx",
          isolatedModules: true,
          paths: { "@/*": ["./src/*"] },
        },
        include: [
          "src/**/*.ts",
          "src/**/*.tsx",
          "convex/**/*.ts",
          "tests/**/*.ts",
          "vite.config.ts",
        ],
        exclude: ["node_modules", "dist"],
      },
      null,
      2,
    )}\n`,
    source: "preset-glue",
  });

  if (hasContractTests) {
    files.push({
      path: "vitest.config.ts",
      content: `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
`,
      source: "preset-glue",
    });
  }

  files.push({
    path: "PRESET.md",
    content: [
      `# ${CONVEX_APPLICATION_PRESET_ID} v${CONVEX_APPLICATION_PRESET_VERSION}`,
      "",
      "Assembled by Builder from Manifest-published Convex application proofs.",
      complete
        ? "Status: **complete** (`verifyConvexApplicationAssembly` passed)."
        : "Status: **incomplete** — see blockers / assembly checks.",
      "",
      "## Requirements",
      ...requirements.map((r) => {
        const optedOut =
          r.id === "docs-diagrams" && diagramsSkipped
            ? " — Capsule opted out (`skipDocsDiagrams`; not emitted)"
            : r.id === "contract-tests" && contractTestsSkipped
              ? " — Capsule opted out (`skipContractTests`; export-only tests not emitted)"
              : "";
        return (
          `- [${r.status === "available" ? "x" : " "}] **${r.title}** (${r.id})` +
          (r.status === "blocked" ? ` — blocked: ${r.missing}` : "") +
          optedOut
        );
      }),
      "",
      "## Required companions",
      ...CONVEX_ASSEMBLY_REQUIRED_COMPANIONS.map((c) => `- ${c}`),
      ...(diagramsSkipped || contractTestsSkipped
        ? [
            "",
            "## Capsule opt-outs",
            ...(diagramsSkipped
              ? ["- docs-diagrams / mermaid file emission (`skipDocsDiagrams`)"]
              : []),
            ...(contractTestsSkipped
              ? ["- Export-only contract test emission (`skipContractTests`)"]
              : []),
          ]
        : []),
      "",
      "## Auth context seam",
      `- Generated Convex surfaces import \`getAuthContext\` from \`${CONVEX_AUTH_CONTEXT_IMPORT}\`.`,
      `- Author module path: \`${CONVEX_AUTH_CONTEXT_PATH}\` (fail-closed; customize IdP claims).`,
      "",
    ].join("\n"),
    source: "preset-glue",
  });

  let wiringInspect: ConvexApplicationPresetResult["wiringInspect"];
  if (available.has("wiring-contract")) {
    const report = inspectProjectWiring({
      ir,
      sources: { "app/.keep": "// no consumers yet\n" },
      config: { strictCoverage: true, roots: ["app"] },
    });
    wiringInspect = {
      ok: report.ok,
      unwired: report.summary.unwired,
      mismatches: report.summary.mismatches,
    };
  }

  return {
    presetId: CONVEX_APPLICATION_PRESET_ID,
    version: CONVEX_APPLICATION_PRESET_VERSION,
    complete,
    requirements,
    files,
    dependencies,
    envVars: available.has("convex-core")
      ? ["CONVEX_DEPLOYMENT", "CONVEX_FIELD_ENCRYPTION_KEY"]
      : [],
    errors,
    blockers,
    ...(assemblyVerification ? { assemblyVerification } : {}),
    ...(seedBinding ? { seedBinding } : {}),
    ...(wiringInspect ? { wiringInspect } : {}),
  };
}
