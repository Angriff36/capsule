import {
  getProjection,
  getProjectionNames,
} from "@angriff36/manifest/projections";
import type { Diagnostic, IR } from "./types";
import {
  listProjectionDescriptors,
  validateProjectionRequest,
} from "./projectionDescriptors";

export interface ProjectionMeta {
  name: string;
  description: string;
  surfaces: string[];
}

export function availableProjections(): ProjectionMeta[] {
  getProjectionNames();
  return listProjectionDescriptors().map((p) => ({
    name: p.name,
    description: p.description,
    surfaces: [...p.surfaceIds],
  }));
}

export interface GeneratedArtifact {
  id: string;
  pathHint?: string;
  contentType?: string;
  code: string;
}

export interface GenerationStats {
  /** Wall-clock time the projection spent generating, in milliseconds. */
  durationMs: number;
  artifactCount: number;
  /** Total UTF-8 size of all generated artifact code. */
  totalBytes: number;
}

export interface GenerateResult {
  artifacts: GeneratedArtifact[];
  diagnostics: Diagnostic[];
  stats: GenerationStats;
  error?: string;
  /** True when Builder blocked invocation before calling Manifest generate. */
  blocked?: boolean;
}

// Above this, generation is flagged as unusually slow in the UI — informational
// only, never a compiler error.
export const SLOW_GENERATION_MS = 200;

const generationCache = new Map<string, GenerateResult>();
const GENERATION_CACHE_MAX = 64;

/** Test hook: clear the projection generation cache. */
export function clearGenerationCache(): void {
  generationCache.clear();
}

function emptyStats(durationMs: number): GenerationStats {
  return { durationMs, artifactCount: 0, totalBytes: 0 };
}

export function generateProjection(
  ir: IR,
  projectionName: string,
  surface: string,
  request: {
    entity?: string;
    command?: string;
    options?: Record<string, unknown>;
    /**
     * Opt into Manifest generate without ProjectionDescriptor scope/options.
     * Required for assembly/preset; UI must omit this and show the blocker.
     */
    invokeWithoutDescriptor?: boolean;
  } = {},
): GenerateResult {
  const { invokeWithoutDescriptor, ...generateRequest } = request;
  const validation = validateProjectionRequest(
    projectionName,
    surface,
    invokeWithoutDescriptor === true ? { invokeWithoutDescriptor: true } : {},
  );
  if (!validation.ok) {
    return {
      artifacts: [],
      diagnostics: validation.blockers.map((message) => ({
        severity: "error" as const,
        message,
      })),
      stats: emptyStats(0),
      error: validation.blockers.join(" "),
      blocked: true,
    };
  }

  // Cache key does not encode scoped requests/options — bypass for configured generation.
  const contentHash =
    Object.keys(generateRequest).length === 0
      ? ir.provenance?.contentHash
      : undefined;
  const cacheKey = contentHash
    ? `${contentHash}\u0000${projectionName}\u0000${surface}`
    : null;
  if (cacheKey) {
    const hit = generationCache.get(cacheKey);
    if (hit) {
      generationCache.delete(cacheKey);
      generationCache.set(cacheKey, hit);
      return hit;
    }
  }

  const started = performance.now();
  const generated = ((): Omit<GenerateResult, "stats"> => {
    const projection = getProjection(projectionName);
    if (!projection) {
      return {
        artifacts: [],
        diagnostics: [],
        error: `Unknown projection: ${projectionName}`,
        blocked: true,
      };
    }
    try {
      const out = projection.generate(ir, { surface, ...generateRequest });
      return {
        artifacts: (out.artifacts ?? []) as GeneratedArtifact[],
        diagnostics: (out.diagnostics ?? []) as Diagnostic[],
      };
    } catch (err) {
      return {
        artifacts: [],
        diagnostics: [],
        error: err instanceof Error ? err.message : "Projection failed",
      };
    }
  })();
  const encoder = new TextEncoder();
  const result: GenerateResult = {
    ...generated,
    stats: {
      durationMs: performance.now() - started,
      artifactCount: generated.artifacts.length,
      totalBytes: generated.artifacts.reduce(
        (n, a) => n + encoder.encode(a.code).length,
        0,
      ),
    },
  };

  if (cacheKey) {
    generationCache.set(cacheKey, result);
    if (generationCache.size > GENERATION_CACHE_MAX) {
      const oldest = generationCache.keys().next().value;
      if (oldest !== undefined) generationCache.delete(oldest);
    }
  }
  return result;
}
