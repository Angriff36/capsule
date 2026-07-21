import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CapsuleAgentJwtMinter } from "./CapsuleAgentJwtMinter";

/**
 * Resolves a live Clerk JWT for agent Convex writes.
 * Session tokens expire in ~60s — reloads .env.local and remints when near expiry.
 */
export class CapsuleAgentJwtSession {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly envLocalPath: string = resolve(
      process.cwd(),
      ".env.local",
    ),
    private readonly minter: CapsuleAgentJwtMinter = new CapsuleAgentJwtMinter(
      env,
      envLocalPath,
    ),
    private readonly skewSeconds = 20,
    private readonly nowSeconds: () => number = () =>
      Math.floor(Date.now() / 1000),
  ) {}

  async resolve(): Promise<string> {
    this.reloadAgentJwtFromEnvLocal();
    const current = this.readConfiguredJwt();
    if (current && !this.isExpiringSoon(current)) {
      return current;
    }

    if (!this.env.CLERK_SECRET_KEY?.trim()) {
      if (current) {
        return current;
      }
      throw new Error(
        "Missing CAPSULE_AGENT_JWT and CLERK_SECRET_KEY. " +
          "Set CLERK_SECRET_KEY in .env.local (or run bun run agent:mint-jwt while a Capsule UI session is active).",
      );
    }

    const minted = await this.minter.mint();
    this.minter.writeEnvLocal(minted.jwt);
    this.env.CAPSULE_AGENT_JWT = minted.jwt;
    return minted.jwt;
  }

  private readConfiguredJwt(): string {
    return (
      this.env.CAPSULE_AGENT_JWT?.trim() ||
      this.env.CLERK_CONVEX_JWT?.trim() ||
      ""
    );
  }

  private reloadAgentJwtFromEnvLocal(): void {
    if (!existsSync(this.envLocalPath)) {
      return;
    }
    for (const rawLine of readFileSync(this.envLocalPath, "utf8").split(
      /\r?\n/,
    )) {
      const line = rawLine.trim();
      if (
        !line ||
        line.startsWith("#") ||
        !line.startsWith("CAPSULE_AGENT_JWT=")
      ) {
        continue;
      }
      let value = line.slice("CAPSULE_AGENT_JWT=".length).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) {
        this.env.CAPSULE_AGENT_JWT = value;
      }
    }
  }

  private isExpiringSoon(jwt: string): boolean {
    const exp = readJwtExp(jwt);
    if (exp === null) {
      return true;
    }
    return exp <= this.nowSeconds() + this.skewSeconds;
  }
}

function readJwtExp(jwt: string): number | null {
  const parts = jwt.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}
