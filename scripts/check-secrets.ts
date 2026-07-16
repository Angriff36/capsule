import { readFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";
import { SecretScan } from "./SecretScan";

const ROOT = process.cwd();
const FIXTURE = "tests/fixtures/secret-scan/synthetic-leak.txt";

async function trackedFiles(): Promise<string[]> {
  const result = await $`git ls-files -z`.quiet();
  const raw = result.stdout.toString("utf8");
  return raw
    .split("\0")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function proveFixtureDetection(): Promise<void> {
  const fixturePath = path.join(ROOT, FIXTURE);
  const content = await readFile(fixturePath, "utf8");
  const probe = new SecretScan([]);
  const hits = probe.findFindings(FIXTURE, content);
  if (hits.length === 0) {
    throw new Error(
      `SecretScan failed to detect synthetic fixture at ${FIXTURE}`,
    );
  }
  console.log(`secret-scan: fixture detection ok (${hits.length} hit(s))`);
}

async function main(): Promise<void> {
  const scanner = new SecretScan([FIXTURE]);
  await proveFixtureDetection();

  const files = await trackedFiles();
  const findings = [];
  for (const relative of files) {
    if (!scanner.shouldScanPath(relative)) continue;
    let content: string;
    try {
      content = await readFile(path.join(ROOT, relative), "utf8");
    } catch {
      continue;
    }
    findings.push(...scanner.findFindings(relative, content));
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(
        `secret-scan: ${finding.name} at ${finding.path}:${finding.line}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`secret-scan: clean (${files.length} tracked files scanned)`);
}

await main();
