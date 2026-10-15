import { CheckChangeSet } from "./CheckChangeSet";
import { CheckSkipPolicy } from "./CheckSkipPolicy";
import type { CheckTask, CheckWave } from "./CheckWaveRunner";

/** Same checks as before: wave 0 fail-fast, then independent waves in parallel. */
export class CheckGatePlan {
  readonly waves: CheckWave[];
  readonly unproven: string;

  constructor(root: string) {
    const changes = CheckChangeSet.load(root);
    const skip = new CheckSkipPolicy(changes);
    this.unproven = changes.proven ? "" : changes.whyUnproven;
    this.waves = [wave0(), waveProof(), wave1(skip), wave2(skip)];
  }
}

function wave0(): CheckWave {
  return {
    name: "wave 0 (fail fast)",
    serial: true,
    tasks: [
      script("toolchain"),
      script("secrets"),
      script("format:check"),
      {
        id: "ownership",
        argv: ["scripts/builder-regen-guard.ts", "--check-ownership"],
      },
    ],
  };
}

function waveProof(): CheckWave {
  return {
    name: "wave 0b (proof emit then check)",
    serial: true,
    tasks: [
      {
        id: "proof:emit+check",
        steps: [
          ["run", "proof:emit"],
          ["run", "check:proof"],
        ],
      },
    ],
  };
}

function wave1(skip: CheckSkipPolicy): CheckWave {
  const fmtScan = skip.manifestFmtScan();
  return {
    name: "wave 1 (independent gates)",
    tasks: [
      script("typecheck"),
      maybe("check:design-vocab", skip.designVocab()),
      maybe("check:manifest-registry", skip.manifestRegistry()),
      maybe("check:manifest-breaking", skip.manifestBreaking()),
      maybe("check:manifest-fmt", fmtScan),
      maybe("check:manifest-scan", fmtScan),
      script("check:manifest-completeness"),
      script("check:wiring-drift"),
      script("check:manifest-integration"),
      script("baseline:decay"),
    ],
  };
}

function wave2(skip: CheckSkipPolicy): CheckWave {
  const testEnv = { CAPSULE_TEST_WORKERS: wave2TestWorkers() };
  return {
    name: "wave 2 (slow independent gates)",
    maxConcurrent: 2,
    tasks: [
      ...wave2TestTasks(skip, testEnv),
      {
        id: "check:access-matrix",
        argv: ["run", "check:access-matrix"],
        env: testEnv,
      },
      script("build"),
      maybe("check:storybook", skip.storybook()),
    ],
  };
}

function wave2TestTasks(
  skip: CheckSkipPolicy,
  testEnv: Record<string, string>,
): CheckTask[] {
  const coverage = skip.coverage();
  const proofs = skip.runtimeProofs();
  if (!coverage.skip && !proofs.skip) {
    return [
      {
        id: "test:coverage",
        argv: ["run", "test:coverage"],
        env: { ...testEnv, CAPSULE_TEST_PROOFS: "1" },
      },
    ];
  }
  const tasks: CheckTask[] = [];
  if (coverage.skip) {
    tasks.push({
      id: "test:coverage",
      argv: ["run", "test:coverage"],
      skip: coverage,
    });
    tasks.push({ id: "test", argv: ["run", "test"], env: testEnv });
  } else {
    tasks.push({
      id: "test:coverage",
      argv: ["run", "test:coverage"],
      env: testEnv,
    });
  }
  tasks.push(
    maybe("test:proofs", proofs, {
      env: { ...testEnv, CAPSULE_TEST_PROOFS: "1" },
    }),
  );
  return tasks;
}

/** Leave cores for vite/storybook when those run beside coverage. */
function wave2TestWorkers(): string {
  const requested = Number(process.env.CAPSULE_TEST_WORKERS);
  if (Number.isFinite(requested) && requested > 0) {
    return String(Math.min(requested, 4));
  }
  return "4";
}

function script(id: string): CheckTask {
  return { id, argv: ["run", id] };
}

function maybe(
  id: string,
  decision: { skip: false } | { skip: true; reason: string },
  extra?: { env?: Record<string, string> },
): CheckTask {
  const argv = ["run", id];
  if (decision.skip) return { id, argv, skip: decision };
  return { id, argv, env: extra?.env };
}
