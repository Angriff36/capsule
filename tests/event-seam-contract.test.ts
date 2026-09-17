import { beforeAll, describe, expect, it } from "vitest";
import { EventAuthAndEncryptionProof } from "./event-seam/EventAuthAndEncryptionProof";

describe("Event seam contract", () => {
  const cryptoAuth = new EventAuthAndEncryptionProof();

  beforeAll(() => {
    if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
      // Deterministic 32-byte key for local contract proof only.
      process.env.CONVEX_FIELD_ENCRYPTION_KEY =
        "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
    }
  });

  it("fails closed in getAuthContext without identity, role, or tenant", async () => {
    await cryptoAuth.assertFailClosedWhenUnauthenticated();
    await cryptoAuth.assertFailClosedWhenClaimsMissing();
    await cryptoAuth.assertRoleAndTenantPropagate();
  });

  it("encrypts Event sensitive fields without embedding plaintext", async () => {
    const envelope =
      await cryptoAuth.assertEncryptDecryptRoundTrip("alice@example.com");
    expect(envelope).toContain('"v":1');
    expect(envelope).not.toContain("alice@example.com");
  });
});
