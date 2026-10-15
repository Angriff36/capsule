import { CheckChangeSet } from "./CheckChangeSet";
import { CheckSkipPolicy } from "./CheckSkipPolicy";
import type { CheckTask, CheckWave } from "./CheckWaveRunner";

/** Same checks as the old `package.json` `check` script, grouped by independence. */
export class CheckGatePlan {
  readonly waves: CheckWave[];
  readonly unproven: string;

  constructor(root: string) {
    const changes = CheckChangeSet.load(root);
    const skip = new CheckSkipPolicy(changes);
    this.unproven = changes.proven ? "" : changes.whyUnproven;
    const storybook = skip.storybook();
    const designVocab = skip.designVocab();
    const manifestScan = skip.manifestFmtScan();
    const manifestBreaking = skip.manifestBreaking();

    this.waves = [
      {
        name: "wave 0 (stop if the tree is illegal)",
        tasks: [
          script("toolchain"),
          script("secrets"),
          {
            id: "ownership",
            argv: ["scripts/builder-regen-guard.ts", "--check-ownership"],
          },
        ],
      },
      {
        name: "wave 0b (proof files, before format)",
        serial: true,
        tasks: [script("proof:emit"), script("check:proof")],
      },
      {
        name: "wave 1 (independent gates)",
        tasks: [
          script("format:check"),
          script("typecheck"),
          script("check:manifest-registry"),
          maybe(
            "check:manifest-breaking",
            ["run", "check:manifest-breaking"],
            manifestBreaking,
          ),
          maybe(
            "check:manifest-fmt",
            ["run", "check:manifest-fmt"],
            manifestScan,
          ),
          maybe(
            "check:manifest-scan",
            ["run", "check:manifest-scan"],
            manifestScan,
          ),
          script("check:manifest-completeness"),
          script("check:wiring-drift"),
          script("check:manifest-integration"),
          maybe(
            "check:design-vocab",
            ["run", "check:design-vocab"],
            designVocab,
          ),
          script("baseline:decay"),
        ],
      },
      {
        name: "wave 2 (slow independent gates)",
        tasks: [
          script("test:coverage"),
          script("check:access-matrix"),
          script("build"),
          maybe("check:storybook", ["run", "check:storybook"], storybook),
        ],
      },
    ];
  }
}

function script(id: string): CheckTask {
  return { id, argv: ["run", id] };
}

function maybe(
  id: string,
  argv: string[],
  decision: { skip: false } | { skip: true; reason: string },
): CheckTask {
  if (decision.skip) return { id, argv, skip: decision };
  return { id, argv };
}
