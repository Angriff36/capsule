/**
 * Required-gate check for generated wiring drift.
 * Compiler pin, contract copies, consumer ids, and uncommitted generation.
 * Full regeneration stays in `bun run manifest:regen:check`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CapsuleWiringDriftCheck } from "../src/agent/CapsuleWiringDriftCheck";

const ROOT = process.cwd();
const GENERATED = "src/generated/manifest-wiring-contract.json";
const COPY = "wiring/contract.json";
const BINDINGS = "src/generated/manifest-wiring-bindings.ts";
const CONSUMER_FILES = [
  "src/agent/CapsuleStaffActionOffer.ts",
  "src/agent/CapsuleLiveEventPrepStateLoader.ts",
] as const;

type ContractFile = {
  meta?: { compilerVersion?: string; contentHash?: string };
  capabilities?: Array<{ capabilityId?: string }>;
  reads?: Array<{ exportName?: string }>;
};

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function quotedIds(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] ?? "");
}

function dirty(pathspecs: readonly string[]): string[] {
  const output = execFileSync(
    "git",
    ["status", "--porcelain", "--", ...pathspecs],
    { cwd: ROOT, encoding: "utf8" },
  );
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function main(): void {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
  };
  const contract = JSON.parse(read(GENERATED)) as ContractFile;
  const copy = JSON.parse(read(COPY)) as ContractFile;
  const bindings = read(BINDINGS);
  const hash = bindings.match(/WIRING_CONTRACT_HASH = "([^"]+)"/);
  const offer = read(CONSUMER_FILES[0]);
  const loader = read(CONSUMER_FILES[1]);
  const check = new CapsuleWiringDriftCheck();
  const problems = [
    ...check.contractProblems({
      pinnedCompilerVersion: pkg.dependencies?.["@angriff36/manifest"] ?? "",
      contractCompilerVersion: contract.meta?.compilerVersion ?? "",
      copyCompilerVersion: copy.meta?.compilerVersion ?? "",
      contractContentHash: contract.meta?.contentHash ?? "",
      bindingsContractHash: hash?.[1] ?? "",
      capabilityIds: new Set(
        (contract.capabilities ?? []).map((item) => item.capabilityId ?? ""),
      ),
      readExportNames: new Set(
        (contract.reads ?? []).map((item) => item.exportName ?? ""),
      ),
      referencedCapabilityIds: quotedIds(
        offer,
        /"([A-Z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*)"/g,
      ),
      referencedReadExports: quotedIds(loader, /argumentsFor\("([^"]+)"/g),
    }),
    ...check.generationProblems({
      dirtyManifests: dirty(["src/app.manifest", "src"]).filter((line) =>
        line.includes(".manifest"),
      ),
      dirtyWiring: dirty([GENERATED, COPY, BINDINGS]),
    }),
  ];
  if (problems.length > 0) {
    console.error("wiring-drift:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log("wiring-drift: generated wiring matches the pin and consumers.");
}

main();
