/**
 * Mint CAPSULE_AGENT_JWT into .env.local for agent:enter-recipe / agent:mcp.
 *
 *   bun run agent:mint-jwt
 *
 * Prefers an active Clerk session that already has an organization selected
 * (sign into Capsule UI first). Requires CLERK_SECRET_KEY.
 */
import { CapsuleAgentJwtMinter } from "../src/agent/CapsuleAgentJwtMinter";

async function main(): Promise<void> {
  const minter = new CapsuleAgentJwtMinter();
  const minted = await minter.mint();
  minter.writeEnvLocal(minted.jwt);
  console.log(
    JSON.stringify(
      {
        ok: true,
        wrote: "CAPSULE_AGENT_JWT → .env.local",
        userId: minted.userId,
        organizationId: minted.organizationId,
        sessionId: minted.sessionId,
        template: minted.template,
        jwtLength: minted.jwt.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[capsule-mint-agent-jwt] ${message}`);
  process.exit(1);
});
