import { createClerkClient } from "@clerk/backend";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface MintedAgentJwt {
  jwt: string;
  userId: string;
  organizationId: string;
  template: string;
  sessionId: string;
}

/**
 * Mints a Clerk JWT for Capsule agent command calls.
 * Prefers an existing active session that already has an organization
 * (so {{org.id}} / {{org.role}} resolve). Falls back to createSession.
 */
export class CapsuleAgentJwtMinter {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly envLocalPath: string = resolve(
      process.cwd(),
      ".env.local",
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

    this.assertClaims(jwt, template || "(session)", organizationId);

    return {
      jwt,
      userId,
      organizationId,
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

  private async resolveActor(
    clerk: ReturnType<typeof createClerkClient>,
  ): Promise<{ userId: string; organizationId: string }> {
    const configuredUser = this.env.CAPSULE_AGENT_USER_ID?.trim();
    const configuredOrg = this.env.CAPSULE_AGENT_ORG_ID?.trim();

    if (configuredUser && configuredOrg) {
      return { userId: configuredUser, organizationId: configuredOrg };
    }

    if (configuredUser) {
      const memberships = await clerk.users.getOrganizationMembershipList({
        userId: configuredUser,
        limit: 10,
      });
      const first = memberships.data[0];
      if (!first) {
        throw new Error(
          `User ${configuredUser} has no organization membership — Capsule needs tenantId from org.id.`,
        );
      }
      return {
        userId: configuredUser,
        organizationId: first.organization.id,
      };
    }

    const users = await clerk.users.getUserList({ limit: 20 });
    for (const user of users.data) {
      const memberships = await clerk.users.getOrganizationMembershipList({
        userId: user.id,
        limit: 5,
      });
      const first = memberships.data[0];
      if (first) {
        return { userId: user.id, organizationId: first.organization.id };
      }
    }

    throw new Error(
      "No Clerk user with an organization membership found. " +
        "Sign into Capsule UI once with an org, or set CAPSULE_AGENT_USER_ID + CAPSULE_AGENT_ORG_ID.",
    );
  }

  private async resolveSessionId(
    clerk: ReturnType<typeof createClerkClient>,
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const sessions = await clerk.sessions.getSessionList({
      userId,
      status: "active",
    });
    const withOrg = sessions.data.find(
      (session) => session.lastActiveOrganizationId === organizationId,
    );
    if (withOrg) {
      return withOrg.id;
    }
    const anyActive = sessions.data[0];
    if (anyActive?.lastActiveOrganizationId) {
      return anyActive.id;
    }

    // Last resort: brand-new session (org claims may be empty — assertClaims will fail loudly).
    const created = await clerk.sessions.createSession({ userId });
    return created.id;
  }

  private assertClaims(
    jwt: string,
    template: string,
    organizationId: string,
  ): void {
    const claims = decodeJwtPayload(jwt);
    const hasTenant =
      typeof claims.tenantId === "string" && claims.tenantId.length > 0;
    const hasRole = typeof claims.role === "string" && claims.role.length > 0;
    if (hasTenant && hasRole) return;

    throw new Error(
      `Minted JWT missing role/tenantId (hasRole=${hasRole}, hasTenant=${hasTenant}). ` +
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
