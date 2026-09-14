/**
 * bunfig.toml preload. No-ops unless this process is `bun run seed`
 * (scripts/seed-convex.ts). Never attaches auth to tests or other scripts.
 */
const isSeedConvex = process.argv.some((arg) =>
  arg.replaceAll("\\", "/").includes("scripts/seed-convex.ts"),
);

if (isSeedConvex) {
  const { installSeedConvexAuth } = await import("./seedConvexAuth.ts");
  installSeedConvexAuth();
  console.log(
    "seed-convex-auth-preload: attaching CAPSULE_AGENT_JWT to ConvexHttpClient",
  );
}
