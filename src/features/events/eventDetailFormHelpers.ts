export const optional = (value: string) => value.trim() || undefined;

export function list(value: string): string[] | undefined {
  const values = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

export function localDateTime(value?: number | null): string {
  if (value == null) return "";
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}
