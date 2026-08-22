export function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function startOfDay(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function endOfDay(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
