export function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function startOfDay(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

export function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999`).getTime();
}
