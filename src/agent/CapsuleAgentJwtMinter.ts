import { createClerkClient } from "@clerk/backend";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CapsuleAgentPersonFirstClaimCheck } from "./CapsuleAgentPersonFirstClaimCheck";

export interface MintedAgentJwt {
  jwt: string;
  userId: string;
  /** Clerk organization id, or null for a person-first (no-org) account. */
  organizationId: string | null;
  /** Tenant the server will act in — org.id, or the linked Person's tenant. */
  tenantId: string;
  /** Where the server takes role/tenant from for this token. */
  roleSource: "idp" | "person";
  template: string;
  sessionId: string;
}

type ClerkClient = ReturnType<typeof createClerkClient>;

interface ResolvedActor {
  userId: string;
  organizationId: string | null;
}

/**
 * Mints a Clerk JWT for Capsule agent command calls.
 * Prefers an existing active session that already has an organization
 * (so {{org.id}} / {{org.role}} resolve). A user with no organization is
 * still minted: the server resolves tenant/role from the linked Person, and
 * that is confirmed through authStatus.getAuthStatus before the token is
 * accepted (#236).
 */
export class CapsuleAgentJwtMinter {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly envLocalPath: string = resolve(
      process.cwd(),
      ".env.local",
    ),
    private readonly personFirstCheck: CapsuleAgentPersonFirstClaimCheck = new CapsuleAgentPersonFirstClaimCheck(
      env,
    ),
  ) {}

  async mint(): Promise<MintedAgentJwt> {
    const secretKey = this.env.CLERK_SECRET_KEY?.trim();
    if (!secretKey) {
      throw new Error(
        "Missing CLERK_SECRET_KEY (needed to mint CAPSULE_AGENT_JWT).",
      );
    }

    const clerk = createClerkClient({ secretKey });
    // Capsule uses customized Clerk *session* claims (role + tenantId).
    // Optional named JWT template via CAPSULE_AGENT_JWT_TEMPLATE (e.g. convex).
    const template = this.env.CAPSULE_AGENT_JWT_TEMPLATE?.trim() || "";
    const { userId, organizationId } = await this.resolveActor(clerk);
    const sessionId = await this.resolveSessionId(
      clerk,
      userId,
      organizationId,
    );

    const token = template
      ? await clerk.sessions.getToken(sessionId, template)
      : await clerk.sessions.getToken(sessionId);
    const jwt = token.jwt;
    if (!jwt) {
      throw new Error(
        template
          ? `Clerk returned empty JWT for template '${template}'.`
          : "Clerk returned empty session JWT.",
      );
    }

    const authority = await this.resolveAuthority(jwt, userId, organizationId);

    return {
      jwt,
      userId,
      organizationId,
      tenantId: authority.tenantId,
      roleSource: authority.roleSource,
      template,
      sessionId,
    };
  }

  writeEnvLocal(jwt: string): void {
    const key = "CAPSULE_AGENT_JWT";
    const line = `${key}=${jwt}`;
    if (!existsSync(this.envLocalPath)) {
      writeFileSync(this.envLocalPath, `${line}\n`, "utf8");
      return;
    }
    const existing = readFileSync(this.envLocalPath, "utf8");
    const next = existing.match(new RegExp(`^${key}=`, "m"))
      ? existing.replace(new RegExp(`^${key}=.*$`, "m"), line)
      : `${existing.replace(/\s*$/, "")}\n${line}\n`;
    writeFileSync(this.envLocalPath, next, "utf8");
  }

  private async resolveActor(clerk: ClerkClient): Promise<ResolvedActor> {
    const configuredUser = this.env.CAPSULE_AGENT_USER_ID?.trim();
    const configuredOrg = this.env.CAPSULE_AGENT_ORG_ID?.trim();

    if (configuredUser && configuredOrg) {
      return { userId: configuredUser, organizationId: configuredOrg };
    }

    if (configuredUser) {
      return {
        userId: configuredUser,
        organizationId: await this.firstOrganizationId(clerk, configuredUser),
      };
    }

    const users = await clerk.users.getUserList({ limit: 20 });
    let personFirstCandidate: string | null = null;
    for (const user of users.data) {
      const organizationId = await this.firstOrganizationId(clerk, user.id);
      if (organizationId) {
        return { userId: user.id, organizationId };
      }
      if (
        !personFirstCandidate &&
        (await this.hasActiveSession(clerk, user.id))
      ) {
        personFirstCandidate = user.id;
      }
    }
    if (personFirstCandidate) {
      return { userId: personFirstCandidate, organizationId: null };
    }

    throw new Error(
      "No Clerk user with an organization membership or an active Capsule session found. " +
        "Sign into Capsule UI once, or set CAPSULE_AGENT_USER_ID (+ CAPSULE_AGENT_ORG_ID when the account has an org).",
    );
  }

  private async firstOrganizationId(
    clerk: ClerkClient,
    userId: string,
  ): Promise<string | null> {
    const memberships = await clerk.users.getOrganizationMembershipList({
      userId,
      limit: 10,
    });
    return memberships.data[0]?.organization.id ?? null;
  }

  private async hasActiveSession(
    clerk: ClerkClient,
    userId: string,
  ): Promise<boolean> {
    const sessions = await clerk.sessions.getSessionList({
      userId,
      status: "active",
    });
    return sessions.data.length > 0;
  }

  private async resolveSessionId(
    clerk: ClerkClient,
    userId: string,
    organizationId: string | null,
  ): Promise<string> {
    const sessions = await clerk.sessions.getSessionList({
      userId,
      status: "active",
    });
    if (organizationId) {
      const withOrg = sessions.data.find(
        (session) => session.lastActiveOrganizationId === organizationId,
      );
      if (withOrg) return withOrg.id;
    }
    const anyActive = sessions.data[0];
    if (anyActive && (!organizationId || anyActive.lastActiveOrganizationId)) {
      return anyActive.id;
    }

    // Last resort: brand-new session. For an org account its org claims may be
    // empty and resolveAuthority fails loudly; a person-first account is fine.
    const created = await clerk.sessions.createSession({ userId });
    return created.id;
  }

  private async resolveAuthority(
    jwt: string,
    userId: string,
    organizationId: string | null,
  ): Promise<{ tenantId: string; roleSource: "idp" | "person" }> {
    const claims = decodeJwtPayload(jwt);
    const tenantClaim =
      typeof claims.tenantId === "string" && claims.tenantId.length > 0
        ? claims.tenantId
        : null;
    const hasRole = typeof claims.role === "string" && claims.role.length > 0;
    if (tenantClaim && hasRole) {
      return { tenantId: tenantClaim, roleSource: "idp" };
    }

    if (!organizationId) {
      const tenantId = await this.personFirstCheck.assertAuthorized(
        jwt,
        userId,
      );
      return { tenantId, roleSource: "person" };
    }

    throw new Error(
      `Minted JWT missing role/tenantId (hasRole=${hasRole}, hasTenant=${tenantClaim !== null}). ` +
        `Open Capsule UI, select org ${organizationId}, then either re-run mint while that session is active, ` +
        `or in the browser console: await window.Clerk.session.getToken() ` +
        `and set CAPSULE_AGENT_JWT in .env.local. ` +
        `Session token must include role + tenantId claims ` +
        `(see AuthGate: {"role":"{{org.role}}","tenantId":"{{org.id}}"}).`,
    );
  }
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length < 2) return {};
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}
