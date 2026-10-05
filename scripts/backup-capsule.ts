/**
 * Capsule backup and restore (PL-BACKUPS, AC-164). Runbook:
 * docs/operations/backup-and-restore.md.
 *
 *   bun scripts/backup-capsule.ts backup [--dir <folder>] [--keep <n>]
 *   bun scripts/backup-capsule.ts restore <file.capsule-backup> --target <backend url>
 *
 * backup: `convex export --include-file-storage` (every table and every stored
 * file) of the deployment the Convex CLI is pointed at (on the production box:
 * CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY in .env.local), then
 * encrypts the ZIP with AES-256-GCM under CAPSULE_BACKUP_KEY (32 bytes,
 * base64; never stored next to the backups) and deletes the plain ZIP. Beside
 * each backup a .json receipt names the time, the release the backend runs,
 * the size, the SHA-256 of the encrypted file and the NAMES of the backend's
 * settings (values never leave the backend). Only the newest --keep backups
 * (default 14) stay; older ones and their receipts are deleted.
 *
 * restore: decrypts into a temporary ZIP and runs `convex import --replace-all`
 * into the deployment the CLI is pointed at, which must be the --target URL:
 * a restore replaces everything there, so the target is typed out, not
 * assumed. The temporary ZIP is deleted afterwards.
 */
import { spawnSync } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("CAPSBAK1");
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const BACKUP_SUFFIX = ".capsule-backup";

export type ConvexRunner = (args: string[]) => string;

/** Runs the Convex CLI of the checkout `root` with `env`. */
export function convexCli(
  root: string,
  env: Record<string, string | undefined> = process.env,
): ConvexRunner {
  const cli = join(root, "node_modules", "convex", "bin", "main.js");
  return (args) => {
    const r = spawnSync("node", [cli, ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0)
      throw new Error(
        `convex ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`,
      );
    return r.stdout;
  };
}

export function backupKey(value = process.env.CAPSULE_BACKUP_KEY): Buffer {
  const key = Buffer.from(value?.trim() ?? "", "base64");
  if (key.length !== 32)
    throw new Error(
      "CAPSULE_BACKUP_KEY must be 32 random bytes in base64 (make one with: openssl rand -base64 32)",
    );
  return key;
}

async function encryptFile(from: string, to: string, key: Buffer) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const out = createWriteStream(to);
  const write = (bytes: Buffer) =>
    new Promise<void>((done) => {
      if (out.write(bytes)) done();
      else out.once("drain", done);
    });
  await write(Buffer.concat([MAGIC, iv]));
  for await (const chunk of createReadStream(from))
    await write(cipher.update(chunk as Buffer));
  await write(cipher.final());
  await write(cipher.getAuthTag());
  await new Promise<void>((done, fail) =>
    out.end((error?: Error | null) => (error ? fail(error) : done())),
  );
}

async function decryptFile(from: string, to: string, key: Buffer) {
  const size = statSync(from).size;
  const head = Buffer.alloc(MAGIC.length + IV_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  const fd = openSync(from, "r");
  try {
    readSync(fd, head, 0, head.length, 0);
    readSync(fd, tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    closeSync(fd);
  }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error(`${from} is not a Capsule backup`);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    head.subarray(MAGIC.length),
  );
  decipher.setAuthTag(tag);
  // A wrong key or a changed file fails at the end: nothing half-decrypted
  // is imported, because the import only starts after this resolves.
  await pipeline(
    createReadStream(from, { start: head.length, end: size - TAG_BYTES - 1 }),
    decipher,
    createWriteStream(to),
  );
}

function sha256(file: string) {
  return new Promise<string>((done, fail) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", fail)
      .on("end", () => done(hash.digest("hex")));
  });
}

/** Setting names only: `convex env list` prints NAME=value lines. */
function settingNames(convex: ConvexRunner) {
  return convex(["env", "list"])
    .split(/\r?\n/)
    .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name))
    .sort();
}

function releaseSha(convex: ConvexRunner) {
  try {
    const out = convex(["run", "deploymentProbe:health"]);
    return /"releaseSha"\s*:\s*"([^"]+)"/.exec(out)?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export type BackupReceipt = {
  file: string;
  takenAt: string;
  releaseSha: string;
  exportMs: number;
  bytes: number;
  sha256: string;
  settingNames: string[];
  removedOld: string[];
};

export async function backup(options: {
  convex: ConvexRunner;
  dir: string;
  keep: number;
  key: Buffer;
  now?: Date;
}): Promise<BackupReceipt> {
  const { convex, dir, keep, key } = options;
  mkdirSync(dir, { recursive: true });
  const now = options.now ?? new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const zip = join(dir, `capsule-${stamp}.zip`);
  const file = join(dir, `capsule-${stamp}${BACKUP_SUFFIX}`);
  const takenAt = now.toISOString();
  const start = performance.now();
  try {
    convex(["export", "--include-file-storage", "--path", zip]);
    await encryptFile(zip, file, key);
  } finally {
    rmSync(zip, { force: true });
  }
  const exportMs = Math.round(performance.now() - start);
  const receipt: BackupReceipt = {
    file,
    takenAt,
    releaseSha: releaseSha(convex),
    exportMs,
    bytes: statSync(file).size,
    sha256: await sha256(file),
    settingNames: settingNames(convex),
    removedOld: [],
  };
  // Keep the newest `keep` backups (names sort by time).
  const backups = readdirSync(dir)
    .filter((name) => name.endsWith(BACKUP_SUFFIX))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    rmSync(join(dir, old), { force: true });
    rmSync(join(dir, old.replace(BACKUP_SUFFIX, ".json")), { force: true });
    receipt.removedOld.push(old);
  }
  writeFileSync(
    file.replace(BACKUP_SUFFIX, ".json"),
    JSON.stringify(receipt, null, 2),
  );
  return receipt;
}

export async function restore(options: {
  convex: ConvexRunner;
  file: string;
  key: Buffer;
}): Promise<{ restoreMs: number }> {
  const { convex, file, key } = options;
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  const zip = join(
    os.tmpdir(),
    `capsule-restore-${process.pid}-${Date.now()}.zip`,
  );
  const start = performance.now();
  try {
    await decryptFile(file, zip, key);
    convex(["import", "--replace-all", "-y", "--format", "zip", zip]);
  } finally {
    rmSync(zip, { force: true });
  }
  return { restoreMs: Math.round(performance.now() - start) };
}

function flag(args: string[], name: string) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

if (import.meta.main) {
  const [mode, ...rest] = process.argv.slice(2);
  const root = resolve(import.meta.dir, "..");
  const convex = convexCli(root);
  if (mode === "backup") {
    const keep = Number(flag(rest, "--keep") ?? 14);
    if (!Number.isInteger(keep) || keep < 1)
      throw new Error("--keep must be a whole number of 1 or more");
    const receipt = await backup({
      convex,
      dir: resolve(
        flag(rest, "--dir") ?? join(os.homedir(), "capsule-backups"),
      ),
      keep,
      key: backupKey(),
    });
    console.log(JSON.stringify(receipt, null, 2));
  } else if (mode === "restore" && rest[0] && !rest[0].startsWith("--")) {
    const target = flag(rest, "--target")?.replace(/\/$/, "");
    const configured = (
      process.env.CONVEX_SELF_HOSTED_URL ??
      process.env.CONVEX_URL ??
      ""
    ).replace(/\/$/, "");
    if (!target || target !== configured)
      throw new Error(
        `restore replaces everything on the backend this checkout points at (${configured || "none set"}). ` +
          "Type that address after --target to go ahead.",
      );
    const { restoreMs } = await restore({
      convex,
      file: resolve(rest[0]),
      key: backupKey(),
    });
    console.log(`restored ${rest[0]} into ${target} in ${restoreMs} ms`);
  } else {
    console.error(
      "usage: bun scripts/backup-capsule.ts backup [--dir <folder>] [--keep <n>]\n" +
        "       bun scripts/backup-capsule.ts restore <file> --target <backend url>",
    );
    process.exit(2);
  }
}
