import { ConvexHttpClient } from "convex/browser";
import { api } from "../lib/api";

export interface PersonFirstAuthStatus {
  authenticated: boolean;
  hasRole: boolean;
  hasTenant: boolean;
  roleSource: "person" | "idp" | "anonymous";
  tenantId: string | null;
}

/** Port so proofs can inject a harness-backed status reader. */
export interface PersonFirstAuthStatusReader {
  read(jwt: string): Promise<PersonFirstAuthStatus>;
}

/**
 * Confirms a session JWT without `role`/`tenantId` claims is still fully
 * authorized because the server resolved both from the linked Person
 * (`authContext.roleSource === "person"`). Used by the agent minter for
 * person-first accounts that have no Clerk organization (#236).
 */
export class CapsuleAgentPersonFirstClaimCheck {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly reader: PersonFirstAuthStatusReader | null = null,
  ) {}

  async assertAuthorized(jwt: string, userId: string): Promise<string> {
    const status = await this.resolveReader().read(jwt);
    if (
      status.authenticated &&
      status.hasRole &&
      status.hasTenant &&
      status.roleSource === "person" &&
      status.tenantId
    ) {
      return status.tenantId;
    }
    throw new Error(
      `Clerk user ${userId} has no organization and the server did not resolve a Person for it ` +
        `(authenticated=${status.authenticated}, hasRole=${status.hasRole}, hasTenant=${status.hasTenant}, ` +
        `roleSource=${status.roleSource}). Link this account to a Person (People → account link) ` +
        `or select a Clerk organization in the Capsule UI, then re-run mint.`,
    );
  }

  private resolveReader(): PersonFirstAuthStatusReader {
    if (this.reader) return this.reader;
    const convexUrl =
      this.env.CONVEX_URL?.trim() || this.env.VITE_CONVEX_URL?.trim() || "";
    if (!convexUrl) {
      throw new Error(
        "Minted a session JWT for a no-organization account, but CONVEX_URL (or VITE_CONVEX_URL) " +
          "is not set, so the linked Person could not be verified with authStatus.getAuthStatus.",
      );
    }
    return {
      read: async (jwt) => {
        const client = new ConvexHttpClient(convexUrl);
        client.setAuth(jwt);
        return (await client.query(
          api.authStatus.getAuthStatus,
          {},
        )) as PersonFirstAuthStatus;
      },
    };
  }
}
