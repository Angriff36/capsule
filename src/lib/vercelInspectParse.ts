/** Read a Vercel CLI inspect / Deployment API payload for receipt gathering.
 *  CLI 50.x often omits meta.gitCommitSha and uses `id` instead of `uid`. */

export function vercelDeploymentUid(
  payload: Record<string, unknown>,
): string | null {
  if (typeof payload.uid === "string" && payload.uid.length > 0) {
    return payload.uid;
  }
  if (typeof payload.id === "string" && payload.id.length > 0) {
    return payload.id;
  }
  return null;
}

export function vercelDeploymentCommitSha(
  payload: Record<string, unknown>,
): string | null {
  const meta =
    payload.meta && typeof payload.meta === "object"
      ? (payload.meta as Record<string, unknown>)
      : {};
  const gitSource =
    payload.gitSource && typeof payload.gitSource === "object"
      ? (payload.gitSource as Record<string, unknown>)
      : {};
  const candidates = [
    meta.gitCommitSha,
    meta.githubCommitSha,
    gitSource.sha,
    payload.commitSha,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && /^[0-9a-f]{40}$/i.test(value)) {
      return value;
    }
  }
  return null;
}

export function vercelDeploymentUrl(
  payload: Record<string, unknown>,
): string | null {
  if (typeof payload.url === "string" && payload.url.length > 0) {
    return payload.url;
  }
  return null;
}

export function vercelReadyState(
  payload: Record<string, unknown>,
): string | null {
  return typeof payload.readyState === "string" ? payload.readyState : null;
}
