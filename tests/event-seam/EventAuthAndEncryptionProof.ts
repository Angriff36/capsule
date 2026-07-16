import type { Auth, UserIdentity } from "convex/server";
import { getAuthContext } from "../../convex/lib/authContext";
import { decrypt, encrypt } from "../../convex/lib/encryption";

/** Proves fail-closed auth and encrypt-before-persist primitives used by Event seams. */
export class EventAuthAndEncryptionProof {
  private authCtx(identity: UserIdentity | null): { auth: Auth } {
    return {
      auth: {
        getUserIdentity: async () => identity,
      } as Auth,
    };
  }

  private identity(
    partial: Partial<UserIdentity> & Pick<UserIdentity, "subject">,
  ): UserIdentity {
    return {
      ...partial,
      tokenIdentifier: partial.tokenIdentifier ?? `token:${partial.subject}`,
      subject: partial.subject,
      issuer: partial.issuer ?? "https://example.clerk.accounts.dev",
    };
  }

  async assertFailClosedWhenUnauthenticated(): Promise<void> {
    const auth = await getAuthContext(this.authCtx(null));
    if (auth.id !== "" || auth.role !== "anonymous" || auth.tenantId !== "") {
      throw new Error(
        "Unauthenticated getAuthContext must return anonymous sentinels",
      );
    }
  }

  async assertFailClosedWhenClaimsMissing(): Promise<void> {
    const auth = await getAuthContext(
      this.authCtx(this.identity({ subject: "user_1" })),
    );
    if (auth.id !== "user_1") {
      throw new Error("Authenticated subject must map to id");
    }
    if (auth.role !== "anonymous" || auth.tenantId !== "") {
      throw new Error(
        "Missing role/tenant claims must fail closed to anonymous/empty",
      );
    }
  }

  async assertRoleAndTenantPropagate(): Promise<void> {
    const auth = await getAuthContext(
      this.authCtx(
        this.identity({
          subject: "user_2",
          role: "org:eventAccess",
          tenantId: "tenant_abc",
        } as Partial<UserIdentity> & Pick<UserIdentity, "subject">),
      ),
    );
    if (auth.role !== "eventAccess" || auth.tenantId !== "tenant_abc") {
      throw new Error("Role namespace and tenantId must propagate from claims");
    }
  }

  async assertEncryptDecryptRoundTrip(plaintext: string): Promise<string> {
    const { ciphertext, keyId } = await encrypt(plaintext, {
      ctx: {},
      entity: "Event",
      property: "primaryContactEmail",
    });
    if (!ciphertext || keyId !== "local-v1") {
      throw new Error("encrypt must return ciphertext and local-v1 key id");
    }
    const envelope = JSON.stringify({ v: 1, kid: keyId, ct: ciphertext });
    if (envelope.includes(plaintext)) {
      throw new Error("Encrypted envelope must not contain plaintext");
    }
    const parsed = JSON.parse(envelope) as { ct: string; kid: string };
    const roundTrip = await decrypt(parsed.ct, parsed.kid, {
      ctx: {},
      entity: "Event",
      property: "primaryContactEmail",
    });
    if (roundTrip !== plaintext) {
      throw new Error("decrypt must restore Event field plaintext");
    }
    return envelope;
  }
}
