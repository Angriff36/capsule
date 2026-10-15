import { EOS_PATHS, quarterStart } from "./eosModel";

export type EosJourneyStepId = "vision" | "seats" | "rocks" | "meeting";

export type EosJourneyStep = {
  id: EosJourneyStepId;
  label: string;
  to: string;
  action: string;
  done: boolean;
};

export type EosJourneyFacts = {
  visionWritten: number;
  liveSeats: number;
  filledSeats: number;
  rocksThisQuarter: number;
  metThisWeek: boolean;
};

type VisionLike =
  | {
      coreFocusPurpose?: string | null | undefined;
      coreFocusNiche?: string | null | undefined;
      tenYearTarget?: string | null | undefined;
      targetMarket?: string | null | undefined;
      provenProcess?: string | null | undefined;
      guarantee?: string | null | undefined;
      threeYearDate?: number | null | undefined;
      oneYearDate?: number | null | undefined;
    }
  | null
  | undefined;

type VisionItemLike = { section: string };

/**
 * The four things to do first, in Traction order. Later tools (People
 * Analyzer, checkup, quarterly days) wait until seats have names.
 */
export class EosJourney {
  static readonly VISION_PARTS = 10;
  static readonly VISION_ENOUGH = 5;

  constructor(private readonly facts: EosJourneyFacts) {}

  seatsHaveNames(): boolean {
    return this.facts.filledSeats > 0;
  }

  showLaterTools(): boolean {
    return this.seatsHaveNames();
  }

  steps(): EosJourneyStep[] {
    const seatsReady =
      this.facts.liveSeats > 0 &&
      this.facts.filledSeats === this.facts.liveSeats;
    const startChart = this.facts.liveSeats === 0;
    return [
      {
        id: "vision",
        label: "Write where Mangia is going",
        to: EOS_PATHS.vision,
        action: "Start writing",
        done: this.facts.visionWritten >= EosJourney.VISION_ENOUGH,
      },
      {
        id: "seats",
        label: "Put a person in each job on the chart",
        to: EOS_PATHS.people,
        action: startChart ? "Start the chart" : "Open People",
        done: seatsReady,
      },
      {
        id: "rocks",
        label: "Set this quarter's Rocks",
        to: `${EOS_PATHS.l10}#rocks`,
        action: "Set Rocks",
        done: this.facts.rocksThisQuarter > 0,
      },
      {
        id: "meeting",
        label: "Run the weekly meeting",
        to: `${EOS_PATHS.l10}?meeting=1`,
        action: "Start this week's meeting",
        done: this.facts.metThisWeek,
      },
    ];
  }

  nextStep(): EosJourneyStep | null {
    return this.steps().find((step) => !step.done) ?? null;
  }

  doneCount(): number {
    return this.steps().filter((step) => step.done).length;
  }

  allReady(): boolean {
    return this.steps().every((step) => step.done);
  }

  static countVisionParts(
    vision: VisionLike,
    items: readonly VisionItemLike[] | undefined,
  ): number {
    const section = (name: string) =>
      (items ?? []).some((row) => row.section === name);
    return [
      section("core_value"),
      !!vision?.coreFocusPurpose,
      !!vision?.coreFocusNiche,
      !!vision?.tenYearTarget,
      !!vision?.targetMarket,
      section("differentiator"),
      !!vision?.provenProcess,
      !!vision?.guarantee,
      vision?.threeYearDate != null || section("three_year"),
      vision?.oneYearDate != null || section("one_year_goal"),
    ].filter(Boolean).length;
  }

  static rocksThisQuarter(
    rows: readonly { kind: string; status: string; closedAt?: number | null }[],
    now: Date,
  ): number {
    const since = quarterStart(now).getTime();
    return rows.filter(
      (row) =>
        row.kind === "rock" &&
        (row.status === "open" || (row.closedAt ?? 0) >= since),
    ).length;
  }
}
