/**
 * Discover Convex application preset requirements from Manifest proofs.
 */

import { getProjectionDescriptor } from "./projectionDescriptors";
import {
  CONVEX_ASSEMBLY_REQUIRED_SURFACES,
  SURFACE_REACT,
  buildSeedTemplate,
  describeConvexSeedBinding,
  generateConvexSeedScript,
  verifyConvexApplicationAssembly,
} from "./convexAssembly";

export type PresetRequirementStatus = "available" | "blocked";

export interface PresetRequirement {
  id: string;
  title: string;
  status: PresetRequirementStatus;
  projection?: string;
  surfaces?: readonly string[];
  missing?: string;
  detail: string;
}

/** Live convex surfaces from the installed Manifest registry. */
export function resolvedConvexSurfaces(): readonly string[] {
  const convex = getProjectionDescriptor("convex");
  if (!convex) return [];
  return [...convex.surfaceIds].sort((a, b) => a.localeCompare(b));
}

function companionRequirement(
  id: string,
  title: string,
  projectionName: string,
  companions: Set<string>,
): PresetRequirement {
  const listed = companions.has(projectionName);
  const descriptor = listed ? getProjectionDescriptor(projectionName) : null;
  const ok = listed && !!descriptor;
  return {
    id,
    title,
    status: ok ? "available" : "blocked",
    projection: projectionName,
    surfaces: descriptor?.surfaceIds ?? [],
    ...(ok
      ? {}
      : {
          missing: listed
            ? `@angriff36/manifest/projections ${projectionName} not registered`
            : `convex.compatibleCompanions must include ${projectionName}`,
        }),
    detail: ok
      ? `Manifest lists ${projectionName} as a Convex-compatible companion.`
      : `${projectionName} is not a verified Convex companion on the installed Manifest.`,
  };
}

/** Discover the Convex application capability matrix from Manifest proofs. */
export function requirementMatrix(): PresetRequirement[] {
  const convex = getProjectionDescriptor("convex");
  const companions = new Set(convex?.compatibleCompanions ?? []);
  const liveConvexSurfaces = resolvedConvexSurfaces();

  const requiredSurfacesOk =
    !!convex &&
    CONVEX_ASSEMBLY_REQUIRED_SURFACES.every((s) =>
      liveConvexSurfaces.includes(s),
    );

  const reactOk = liveConvexSurfaces.includes(SURFACE_REACT);
  const zodOk = companions.has("zod") && !!getProjectionDescriptor("zod");
  const contractTests = companions.has("contract-tests")
    ? getProjectionDescriptor("contract-tests")
    : null;
  const contractTestsOk =
    !!contractTests &&
    contractTests.surfaceIds.includes("contract-tests.convex");

  const seedApiOk =
    typeof describeConvexSeedBinding === "function" &&
    typeof generateConvexSeedScript === "function" &&
    typeof buildSeedTemplate === "function";
  const assemblyApiOk = typeof verifyConvexApplicationAssembly === "function";

  return [
    {
      id: "convex-core",
      title:
        "Convex schema, queries, mutations, crons, HTTP, sagas, react (+ registry extras)",
      status: requiredSurfacesOk ? "available" : "blocked",
      projection: "convex",
      surfaces: liveConvexSurfaces,
      ...(requiredSurfacesOk
        ? {}
        : {
            missing: `CONVEX_ASSEMBLY_REQUIRED_SURFACES incomplete: ${CONVEX_ASSEMBLY_REQUIRED_SURFACES.join(", ")}`,
          }),
      detail: requiredSurfacesOk
        ? `Manifest assembly surfaces present: ${CONVEX_ASSEMBLY_REQUIRED_SURFACES.join(", ")}.`
        : "Required Convex assembly surfaces are missing from the Manifest registry.",
    },
    companionRequirement(
      "wiring-contract",
      "Consumer wiring contract and bindings",
      "wiring",
      companions,
    ),
    companionRequirement(
      "agent-context",
      "Agent context / LLM documentation",
      "llm-context",
      companions,
    ),
    companionRequirement(
      "docs-diagrams",
      "Docs and diagrams",
      "mermaid",
      companions,
    ),
    {
      id: "frontend-convex-api",
      title: "Frontend Convex API consumption contract",
      status: reactOk ? "available" : "blocked",
      projection: "convex",
      surfaces: reactOk ? [SURFACE_REACT] : [],
      ...(reactOk ? {} : { missing: `convex surface ${SURFACE_REACT}` }),
      detail: reactOk
        ? `Manifest publishes ${SURFACE_REACT} on the convex projection.`
        : `${SURFACE_REACT} is not registered — do not substitute react-query/openapi.`,
    },
    {
      id: "synced-validation",
      title: "Shared validation synchronized with Convex API",
      status: zodOk ? "available" : "blocked",
      projection: "zod",
      // Bundle only — never zod.entity / zod.command microfile dumps.
      surfaces: zodOk ? ["zod.schemas"] : [],
      ...(zodOk
        ? {}
        : { missing: "convex.compatibleCompanions must include zod" }),
      detail: zodOk
        ? "Emit zod.schemas (schemas/manifest-schemas.ts) and wire convex.react via zodParamsImport — not per-command schema files."
        : "zod is not listed on convex.compatibleCompanions.",
    },
    {
      id: "seed-fixtures",
      title: "Seed / fixture support for Convex apps",
      status: seedApiOk ? "available" : "blocked",
      ...(seedApiOk
        ? {}
        : {
            missing:
              "@angriff36/manifest/seed-pack describeConvexSeedBinding / generateConvexSeedScript",
          }),
      detail: seedApiOk
        ? "Manifest seed-pack publishes describeConvexSeedBinding and generateConvexSeedScript."
        : "Convex seed binding API is not available on the installed Manifest.",
    },
    {
      id: "contract-tests",
      title: "Generated contract tests",
      status: contractTestsOk ? "available" : "blocked",
      projection: "contract-tests",
      surfaces: contractTests?.surfaceIds ?? [],
      ...(contractTestsOk
        ? {}
        : {
            missing:
              "contract-tests.convex surface via convex.compatibleCompanions → contract-tests",
          }),
      detail: contractTestsOk
        ? "Manifest publishes contract-tests.convex as a Convex companion surface."
        : "contract-tests.convex is not available as a Convex companion surface.",
    },
    {
      id: "assembly-verification",
      title: "Complete application assembly verification",
      status: assemblyApiOk ? "available" : "blocked",
      ...(assemblyApiOk
        ? {}
        : {
            missing:
              "@angriff36/manifest/projections/convex verifyConvexApplicationAssembly",
          }),
      detail: assemblyApiOk
        ? "Manifest publishes verifyConvexApplicationAssembly for end-to-end preset proof."
        : "Assembly verification API is not available on the installed Manifest.",
    },
  ];
}
