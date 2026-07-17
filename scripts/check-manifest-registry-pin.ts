/**
 * Fail when Capsule pins @angriff36/manifest through a local/file dependency.
 * Registry semver ranges only — no file:, .tgz, link:, workspace:, or absolute paths.
 *
 * Other packages may use file: (e.g. local @angriff36/manifest-builder). This
 * gate only polices the @angriff36/manifest pin itself.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import semver from "semver";

const root = process.cwd();
const PKG = "package.json";
const LOCK = "bun.lock";
const LOCAL_PIN =
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
if (LOCAL_PIN.test(pin)) {
  fail(
    `@angriff36/manifest must resolve from the npm registry (got ${JSON.stringify(pin)})`,
  );
}
if (!semver.valid(pin) && !semver.validRange(pin)) {
  fail(
    `@angriff36/manifest must be a registry semver pin or range (got ${JSON.stringify(pin)})`,
  );
}

if (pkg.patchedDependencies) {
  for (const key of Object.keys(pkg.patchedDependencies)) {
    if (
      key === "@angriff36/manifest" ||
      key.startsWith("@angriff36/manifest@")
    ) {
      fail(`patchedDependencies must not include ${key}`);
    }
  }
}

const lock = read(LOCK);

if (/@angriff36\/manifest@(?:file:|link:|workspace:)/i.test(lock)) {
  fail("bun.lock resolves @angriff36/manifest via a local package identity");
}
if (/@angriff36\/manifest@[^"\s]*\.tgz/i.test(lock)) {
  fail("bun.lock resolves @angriff36/manifest from a .tgz");
}
if (/[/\\][Pp]rojects[/\\]Manifest/.test(lock)) {
  fail("bun.lock contains an absolute Manifest path");
}

const locked = lock.match(/"@angriff36\/manifest@(\d+\.\d+\.\d+)"/);
if (!locked) {
  if (!lock.includes(`"@angriff36/manifest": "${pin}"`)) {
    fail(`bun.lock does not lock a registry version for @angriff36/manifest`);
  }
} else {
  const lockedVersion = locked[1];
  const range = semver.validRange(pin) ?? pin;
  if (!semver.satisfies(lockedVersion, range)) {
    fail(
      `bun.lock has @angriff36/manifest@${lockedVersion} but package.json requires ${pin}`,
    );
  }
}

console.log(
  `manifest-registry-pin: ok (@angriff36/manifest ${pin} from registry)`,
);
