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
    this.waves = [wave0(), wave1(skip), wave2(skip)];
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

function wave1(skip: CheckSkipPolicy): CheckWave {
  const cluster = skip.manifestCluster();
  return {
    name: "wave 1 (independent gates)",
    tasks: [
      script("typecheck"),
      maybe("check:design-vocab", skip.designVocab()),
      maybe("check:manifest-registry", skip.manifestRegistry()),
      maybe("check:manifest-breaking", cluster),
      maybe("check:manifest-fmt", cluster),
      maybe("check:manifest-scan", cluster),
      maybe("check:manifest-completeness", cluster),
      maybe("check:wiring-drift", cluster),
      maybe("check:manifest-integration", cluster),
      {
        id: "proof:emit+check",
        steps: [
          ["run", "proof:emit"],
          ["run", "check:proof"],
        ],
      },
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
      { id: "test:coverage", argv: ["run", "test:coverage"], env: testEnv },
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
): CheckTask {
  const argv = ["run", id];
  if (decision.skip) return { id, argv, skip: decision };
  return { id, argv };
}
