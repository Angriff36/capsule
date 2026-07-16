import { describe, expect, it } from "vitest";

describe("proof-kit import boundary", () => {
  it("imports core proof-kit without loading convex-test", async () => {
    const mod = await import("@angriff36/manifest/proof-kit");
    expect(typeof mod.emitCapabilityCatalog).toBe("function");
    expect(typeof mod.validateProofRegistry).toBe("function");
    expect(typeof mod.runManifestIntegrationGuard).toBe("function");
    // Adapter is a separate subpath; this test never imports it.
    expect(Object.keys(mod).join(",")).not.toContain("convexTest");
  });
});
