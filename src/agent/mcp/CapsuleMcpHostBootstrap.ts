import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CapsuleEnvLocalLoader } from "../CapsuleEnvLocalLoader";

/**
 * Prepares process cwd + env for the long-lived Capsule MCP stdio host.
 * Cursor often omits `cwd` and does not inject Bun dotenv — that caused live
 * tool discovery / mcp_auth hangs (#85).
 */
export class CapsuleMcpHostBootstrap {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly chdir: (path: string) => void = (path) => {
      process.chdir(path);
    },
  ) {}

  /** Absolute Capsule repo root (parent of `scripts/` when launched via capsule-mcp.ts). */
  resolveCapsuleRoot(entryUrl: string = import.meta.url): string {
    // Prefer caller-provided entry (scripts/capsule-mcp.ts); fall back to this module.
    const entryPath = fileURLToPath(entryUrl);
    const fromScripts = resolve(dirname(entryPath), "..");
    if (existsSync(join(fromScripts, "package.json"))) {
      return fromScripts;
    }
    const fromAgentMcp = resolve(dirname(entryPath), "..", "..", "..");
    return fromAgentMcp;
  }

  /**
   * chdir to Capsule root and load `.env.local` without overriding existing env.
   * Returns the root used.
   */
  prepare(entryUrl: string = import.meta.url): string {
    const root = this.resolveCapsuleRoot(entryUrl);
    if (process.cwd() !== root) {
      this.chdir(root);
    }
    new CapsuleEnvLocalLoader(this.env, join(root, ".env.local")).load();
    return root;
  }
}
