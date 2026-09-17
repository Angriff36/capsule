/**
 * Projection descriptors for the Builder control plane.
 *
 * Delegates to Manifest's published API on `@angriff36/manifest/projections`
 * (`describeProjection`, `listProjectionDescriptors`,
 * `validateProjectionInvocation`). Builder does not invent scope, options,
 * or companion metadata.
 *
 * Registration alone is not a complete application workflow. UI generate
 * paths call `validateProjectionRequest` without `invokeWithoutDescriptor`;
 * assembly/preset may opt in and accept Manifest diagnostics.
 */

import {
  describeProjection,
  listProjectionDescriptors as listManifestProjectionDescriptors,
  validateProjectionInvocation,
  UnknownProjectionError,
  type ProjectionDescriptor,
} from "@angriff36/manifest/projections";

export type { ProjectionDescriptor } from "@angriff36/manifest/projections";

/** Descriptors for every registered projection (Manifest registry only). */
export function listProjectionDescriptors(): ProjectionDescriptor[] {
  return listManifestProjectionDescriptors();
}

/** Null when the name is not in the Manifest registry. */
export function getProjectionDescriptor(
  name: string,
): ProjectionDescriptor | null {
  try {
    return describeProjection(name);
  } catch (e) {
    if (e instanceof UnknownProjectionError) return null;
    throw e;
  }
}

export interface ProjectionRequestValidation {
  ok: boolean;
  blockers: string[];
  descriptor: ProjectionDescriptor | null;
}

export interface ValidateProjectionRequestOptions {
  /**
   * When true, skip Manifest's safely-invokable / required-options gate so
   * assembly/preset callers can invoke `generate` and rely on its diagnostics.
   * UI must leave this false.
   */
  invokeWithoutDescriptor?: boolean;
}

/**
 * Validate a generate request against Manifest-published descriptors.
 * Blocks unknown names/surfaces always. Blocks unresolved descriptors and
 * missing required scope/options unless `invokeWithoutDescriptor` is set.
 */
export function validateProjectionRequest(
  projectionName: string,
  surface: string,
  options: ValidateProjectionRequestOptions = {},
): ProjectionRequestValidation {
  const descriptor = getProjectionDescriptor(projectionName);
  if (!descriptor) {
    return {
      ok: false,
      blockers: [
        `Unknown projection "${projectionName}". It is not in the Manifest registry.`,
      ],
      descriptor: null,
    };
  }

  if (options.invokeWithoutDescriptor) {
    const blockers: string[] = [];
    if (!descriptor.surfaceIds.includes(surface)) {
      blockers.push(
        `Surface "${surface}" is not registered on projection "${projectionName}". ` +
          `Available surfaces: ${descriptor.surfaceIds.join(", ") || "(none)"}.`,
      );
    }
    return { ok: blockers.length === 0, blockers, descriptor };
  }

  const result = validateProjectionInvocation(projectionName, { surface });
  return {
    ok: result.ok,
    blockers: [...result.blockers],
    descriptor: result.descriptor,
  };
}
