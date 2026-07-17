/**
 * Fail when Capsule pins @angriff36/manifest through a local/file dependency.
 * Registry exact versions only — no file:, .tgz, link:, workspace:, or absolute paths.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const PKG = "package.json";
const LOCK = "bun.lock";
const FORBIDDEN =
  /(?:file:|link:|workspace:|\.tgz\b|[/\\]Projects[/\\]Manifest|[/\\]projects[/\\]Manifest)/i;

function fail(message: string): never {
  console.error(`manifest-registry-pin: ${message}`);
  process.exit(1);
}

function read(rel: string): string {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) fail(`missing ${rel}`);
  return readFileSync(abs, "utf8");
}

const pkg = JSON.parse(read(PKG)) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  patchedDependencies?: Record<string, string>;
};

const pin =
  pkg.dependencies?.["@angriff36/manifest"] ??
  pkg.devDependencies?.["@angriff36/manifest"];
if (!pin) fail("package.json does not declare @angriff36/manifest");
if (FORBIDDEN.test(pin) || !/^\d+\.\d+\.\d+$/.test(pin)) {
  fail(
    `@angriff36/manifest must be an exact registry version (got ${JSON.stringify(pin)})`,
  );
}

if (pkg.patchedDependencies) {
  for (const key of Object.keys(pkg.patchedDependencies)) {
    if (key.startsWith("@angriff36/manifest")) {
      fail(`patchedDependencies must not include ${key}`);
    }
  }
}

const lock = read(LOCK);
if (FORBIDDEN.test(lock)) {
  const hit = lock.match(FORBIDDEN)?.[0] ?? "forbidden pattern";
  fail(`bun.lock contains a local Manifest reference (${hit})`);
}

const locked = lock.match(/"@angriff36\/manifest@(\d+\.\d+\.\d+)"/);
if (!locked) {
  // bun.lock may use a different shape — also accept dependency list form
  if (!lock.includes(`"@angriff36/manifest": "${pin}"`)) {
    fail(`bun.lock does not lock @angriff36/manifest@${pin}`);
  }
} else if (locked[1] !== pin) {
  fail(
    `bun.lock has @angriff36/manifest@${locked[1]} but package.json pins ${pin}`,
  );
}

console.log(
  `manifest-registry-pin: ok (@angriff36/manifest@${pin} from registry)`,
);
