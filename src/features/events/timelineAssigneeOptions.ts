/** Team buckets selectable alongside individual staff on a timeline block. */
export const TIMELINE_ASSIGNEE_TEAMS = ["Everyone", "FOH", "BOH"] as const;

export type TimelineAssigneeTeam = (typeof TIMELINE_ASSIGNEE_TEAMS)[number];

export function isTimelineAssigneeTeam(
  value: string,
): value is TimelineAssigneeTeam {
  return (TIMELINE_ASSIGNEE_TEAMS as readonly string[]).includes(value);
}

/** Map a legacy responsibleParty string into team buckets when lists are empty. */
export function teamsFromResponsibleParty(
  responsibleParty: string | null | undefined,
): TimelineAssigneeTeam[] {
  if (!responsibleParty?.trim()) return [];
  const parts = responsibleParty
    .split(/[,/|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const teams = new Set<TimelineAssigneeTeam>();
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (upper === "EVERYONE" || part === "Everyone") teams.add("Everyone");
    if (upper === "FOH") teams.add("FOH");
    if (upper === "BOH") teams.add("BOH");
  }
  return [...teams];
}

export function formatAssigneeLabel(input: {
  readonly teams: readonly string[];
  readonly personNames: readonly string[];
  readonly fallback?: string | null;
}): string {
  const parts = [...input.teams, ...input.personNames].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return input.fallback?.trim() || "";
}
