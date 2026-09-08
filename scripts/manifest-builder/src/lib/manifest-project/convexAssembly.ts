/**
 * Manifest Convex assembly contracts — re-exported through the control plane.
 */

export {
  CONVEX_ASSEMBLY_REQUIRED_COMPANIONS,
  CONVEX_ASSEMBLY_REQUIRED_SURFACES,
  SURFACE_REACT,
  verifyConvexApplicationAssembly,
  type ConvexAssemblyArtifact,
  type ConvexAssemblyCheck,
  type ConvexAssemblyVerification,
  type VerifyConvexApplicationAssemblyInput,
} from "@angriff36/manifest/projections/convex";

export {
  buildSeedTemplate,
  describeConvexSeedBinding,
  generateConvexSeedScript,
  type ConvexSeedBinding,
  type SeedPack,
} from "@angriff36/manifest/seed-pack";
