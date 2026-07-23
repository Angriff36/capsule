/**
 * Set a Convex deployment env var with trailing CR/LF stripped.
 *
 * Windows PowerShell + `bunx convex env set KEY value` often stores a
 * trailing `\r` (or `\r\n`). That is NOT a Git / `.gitattributes` problem —
 * Convex secrets live outside the repo. For CONVEX_FIELD_ENCRYPTION_KEY a
 * trailing CR changes key derivation and breaks decrypt (see issue #83).
 *
 * Usage:
 *   bun run convex:env-set -- CONVEX_FIELD_ENCRYPTION_KEY <value>
 *   bun run convex:env-set -- --prod CLERK_JWT_ISSUER_DOMAIN <value>
 */
import { spawnSync } from "node:child_process";

function usage(): never {
  console.error(
    "Usage: bun run convex:env-set -- [--prod] <NAME> <VALUE>\n" +
      "Strips trailing CR/LF before calling `convex env set`.",
  );
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
if (rawArgs.length < 2) usage();

const prod = rawArgs[0] === "--prod";
const name = prod ? rawArgs[1] : rawArgs[0];
const valueParts = prod ? rawArgs.slice(2) : rawArgs.slice(1);
if (!name || valueParts.length === 0) usage();

let value = valueParts.join(" ");
while (value.endsWith("\r") || value.endsWith("\n")) {
  value = value.slice(0, -1);
}
value = value.trimEnd();
if (!value) {
  console.error("Refusing to set an empty value after CR/LF strip.");
  process.exit(1);
}

const args = ["convex", "env", "set"];
if (prod) args.push("--prod");
args.push(name, value);

const result = spawnSync("bunx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
