export function studioSlotProps(
  kind: string,
  name: string,
  slotKey: string,
): Record<string, string> {
  return {
    "data-studio-kind": kind,
    "data-studio-slot": name,
    "data-studio-key": slotKey,
  };
}

export function studioSlotKey(kind: string, label: string): string {
  const trimmed = label.replace(/\s+/g, " ").trim().slice(0, 180);
  return `${kind}:${trimmed || "block"}`;
}

export function studioText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
