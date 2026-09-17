import { ConvexHttpClient } from "convex/browser";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";

export function isSeedConvexProcess(
  argv: readonly string[] = process.argv,
): boolean {
  return argv.some((arg) =>
    arg.replaceAll("\\", "/").includes("scripts/seed-convex.ts"),
  );
}

/**
 * Generated seed-convex.ts constructs an unauthenticated ConvexHttpClient.
 * Attach the workspace JWT only when that script is the process being run.
 */
export function installSeedConvexAuth(): void {
  const auth = new CapsuleAgentAuthManager();
  const originalMutation = ConvexHttpClient.prototype.mutation;
  const originalQuery = ConvexHttpClient.prototype.query;
  ConvexHttpClient.prototype.mutation = async function (
    this: ConvexHttpClient,
    ...args: Parameters<ConvexHttpClient["mutation"]>
  ) {
    this.setAuth(await auth.resolveJwt());
    return originalMutation.apply(this, args);
  };
  ConvexHttpClient.prototype.query = async function (
    this: ConvexHttpClient,
    ...args: Parameters<ConvexHttpClient["query"]>
  ) {
    this.setAuth(await auth.resolveJwt());
    return originalQuery.apply(this, args);
  };
}
