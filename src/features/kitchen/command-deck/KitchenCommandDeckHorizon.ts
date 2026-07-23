/** Rolling prep horizon — events within the next N days (default 7). */

export class KitchenCommandDeckHorizon {
  constructor(
    private readonly dayCount: number = 7,
    private readonly dayOffset: number = 0,
  ) {}

  withOffset(deltaDays: number): KitchenCommandDeckHorizon {
    return new KitchenCommandDeckHorizon(
      this.dayCount,
      this.dayOffset + deltaDays,
    );
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
