/** Rolling prep horizon — events within the next N days (default 7). */

const DAY_MS = 86_400_000;

const startOfDay = (input: Date): Date => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

export class KitchenCommandDeckHorizon {
  constructor(
    private readonly dayCount: number = 7,
    private readonly dayOffset: number = 0,
  ) {}

  /** Whole days from today's midnight to the given moment's midnight. */
  static offsetForTimestamp(timestamp: number): number {
    const target = startOfDay(new Date(timestamp)).getTime();
    const today = startOfDay(new Date()).getTime();
    return Math.round((target - today) / DAY_MS);
  }

  /** Offset for a yyyy-mm-dd `<input type="date">` value (local time). */
  static offsetForDateValue(value: string): number | null {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return this.offsetForTimestamp(new Date(year, month - 1, day).getTime());
  }

  withOffset(deltaDays: number): KitchenCommandDeckHorizon {
    return new KitchenCommandDeckHorizon(
      this.dayCount,
      this.dayOffset + deltaDays,
    );
  }

  /** Window start as a yyyy-mm-dd value for `<input type="date">`. */
  startDateValue(): string {
    const d = this.start();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  reset(): KitchenCommandDeckHorizon {
    return new KitchenCommandDeckHorizon(this.dayCount, 0);
  }

  start(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + this.dayOffset);
    return d;
  }

  end(): Date {
    const d = this.start();
    d.setDate(d.getDate() + this.dayCount);
    return d;
  }

  contains(timestamp: number | null | undefined): boolean {
    if (timestamp == null || !Number.isFinite(Number(timestamp))) return false;
    const t = Number(timestamp);
    return t >= this.start().getTime() && t < this.end().getTime();
  }

  get offsetDays(): number {
    return this.dayOffset;
  }
}
