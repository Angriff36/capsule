import { beforeAll, describe, expect, it } from "vitest";
import { EventAuthAndEncryptionProof } from "./event-seam/EventAuthAndEncryptionProof";
import { EventSeamContract } from "./event-seam/EventSeamContract";

describe("Event seam contract", () => {
  const seams = new EventSeamContract();
  const cryptoAuth = new EventAuthAndEncryptionProof();

  beforeAll(() => {
    if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
      // Deterministic 32-byte key for local contract proof only.
      process.env.CONVEX_FIELD_ENCRYPTION_KEY =
        "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
    }
  });

  it("wires EventDetailPage through generated hooks only", () => {
    seams.assertUiReadAndMutationWiring();
    seams.assertUiCannotSelectInternalFunctions();
  });

  it("points generated api at public getEvent and Event_changePrimaryContact", () => {
    seams.assertGeneratedApiPointsAtPublicSurfaces();
    seams.assertHelpersNotExported();
  });

  it("enforces getEvent auth and tenant checks before decrypt/return", () => {
    seams.assertGetEventAuthBeforeDecrypt();
  });

  it("encrypts Event_changePrimaryContact fields before persistence", () => {
    seams.assertChangePrimaryContactAuthEncryptOrder();
  });

  it("keeps hook argument shapes aligned with backend Event commands", () => {
    seams.assertHookArgumentShapes();
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
