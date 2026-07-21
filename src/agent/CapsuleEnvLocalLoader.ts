import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads KEY=VALUE pairs from .env.local into process.env (does not override
 * already-set vars). Cursor-spawned MCP often lacks Bun's automatic dotenv.
 */
export class CapsuleEnvLocalLoader {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly path: string = resolve(process.cwd(), ".env.local"),
  ) {}

  load(): void {
    if (!existsSync(this.path)) {
      return;
    }
    const text = readFileSync(this.path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (this.env[key] === undefined || this.env[key] === "") {
        this.env[key] = value;
      }
    }
  }
}
