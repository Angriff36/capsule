export function studioSlotProps(
  kind: string,
  name: string,
  slotKey: string,
  /** The block shows buttons, links or content a catalog stand-in drops. */
  live = false,
): Record<string, string> {
  return {
    "data-studio-kind": kind,
    "data-studio-slot": name,
    "data-studio-key": slotKey,
    ...(live ? { "data-studio-live": "true" } : {}),
  };
}

export function studioSlotKey(kind: string, label: string): string {
  const trimmed = label.replace(/\s+/g, " ").trim().slice(0, 180);
  return `${kind}:${trimmed || "block"}`;
}

export function studioText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
