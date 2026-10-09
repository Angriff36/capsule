import { describe, expect, it } from "vitest";
import {
  groupWinLoss,
  isBookedAhead,
  isDelivered,
  isOpen,
  isWon,
  lastFullQuarter,
  quarterRows,
  runRate,
  totals,
  winLoss,
  within,
  yearRows,
  ytdPeriod,
  type SalesEvent,
} from "../../src/features/reports/mangia/salesFigures";

// The Mangia Round 4 sales report's measures, counted from Capsule stages.
const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
let n = 0;
const ev = (
  stage: string,
  quotedPrice: number | null,
  startsAt: number,
  extra: Partial<SalesEvent> & { person?: string } = {},
) => ({
  _id: `e${++n}`,
  stage,
  quotedPrice,
  expectedHeadcount: 50,
  startsAt,
  ...extra,
});

const now = new Date(2026, 3, 17, 12);
const events = [
  // 2025: two delivered ($3,000 + $5,000), one lost ($2,000).
  ev("completed", 3000, at(2025, 2, 10), { person: "Tim" }),
  ev("closed_out", 5000, at(2025, 3, 2), { person: "Tim" }),
  ev("cancelled", 2000, at(2025, 3, 5), { person: "Josh" }),
  // 2026 so far: one delivered $6,000, one booked ahead $10,000, one lost
  // $4,000, one open quote $7,000; one delivered after today.
  ev("completed", 6000, at(2026, 0, 20), { person: "Tim" }),
  ev("sales_lock", 10000, at(2026, 3, 10), { person: "Josh" }),
  ev("cancelled", 4000, at(2026, 1, 1), { person: "Josh" }),
  ev("quote", 7000, at(2026, 5, 1), { person: "Tim" }),
  ev("pending_approval", 1000, at(2026, 6, 1), { person: "Tim" }),
  ev("completed", 9000, at(2026, 9, 1), { person: "Tim" }),
];

describe("Mangia sales report measures", () => {
  it("sorts every stage into delivered, booked ahead, open and lost", () => {
    const [d, , lost, , ahead, , quote, waiting] = events;
    expect(isDelivered(d!)).toBe(true);
    expect(isWon(d!) && isWon(ahead!)).toBe(true);
    expect(isBookedAhead(ahead!)).toBe(true);
    expect(isBookedAhead(d!)).toBe(false);
    expect(isOpen(quote!) && isOpen(waiting!)).toBe(true);
    expect(isWon(lost!) || isOpen(lost!)).toBe(false);
  });

  it("counts this year so far against the same dates last year", () => {
    const ytd = within(events, ytdPeriod(now, 2026));
    // The October event is after today: not in "so far".
    expect(totals(ytd.filter(isWon))).toMatchObject({
      events: 2,
      revenue: 16000,
      aev: 8000,
    });
    expect(totals(ytd.filter(isDelivered)).revenue).toBe(6000);
    expect(
      totals(within(events, ytdPeriod(now, 2025), isDelivered)).revenue,
    ).toBe(8000);
    const decided = winLoss(ytd);
    expect(decided.decided).toBe(3);
    expect(decided.winRate).toBeCloseTo((2 / 3) * 100);
    expect(decided.lossRatio).toBeCloseTo(25);
  });

  it("gives each year its delivered average and the 10% goal check", () => {
    const rows = yearRows(events);
    expect(rows.map((r) => r.year)).toEqual([2025, 2026]);
    expect(rows[0]!.delivered.aev).toBe(4000);
    // 2026 delivered: $6,000 + $9,000 over 2 events = $7,500 >= $4,400.
    expect(rows[1]!.delivered.aev).toBe(7500);
    expect(rows[1]!.goalMet).toBe(true);
    expect(rows[1]!.statusCounts).toEqual({
      delivered: 2,
      booked: 1,
      quote: 1,
      waiting: 1,
      lost: 1,
    });
  });

  it("splits win and loss by salesperson", () => {
    const rows = groupWinLoss(
      events,
      (e) => (e as { person?: string }).person ?? "No salesperson",
    );
    const josh = rows.find((r) => r.label === "Josh")!;
    expect(josh.won.events).toBe(1);
    expect(josh.lost.revenue).toBe(6000);
    expect(josh.winRate).toBeCloseTo((1 / 3) * 100);
  });

  it("works out quarters, the last full quarter and the yearly pace", () => {
    expect(lastFullQuarter(now)).toEqual([2026, 1]);
    expect(lastFullQuarter(new Date(2026, 1, 1))).toEqual([2025, 4]);
    const q = quarterRows(events, [2026], now);
    expect(q.map((r) => r.quarter)).toEqual([1, 2]);
    expect(q[0]!.revenue).toBe(6000);
    expect(runRate(1000, 10, 365)).toBe(36500);
  });
});
