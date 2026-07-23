/** Drops undefined/null entries so Convex never receives invalid document values. */
export class CleanCommandArgs {
  from(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      out[key] = value;
    }
    return out;
  }
}

export const cleanCommandArgs = new CleanCommandArgs();
