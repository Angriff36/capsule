// PL-PROPOSAL-DRAFT (AC-259/AC-096): the order a proposal shows its sections.
// Staff set it on the proposal template; each proposal keeps the copy it was
// drafted with. An empty order means "the standard order", so proposals and
// templates saved before sections could move keep the exact layout they had.

export const PROPOSAL_SECTION_IDS = [
  "cover_brand",
  "event_summary",
  "menu_sections",
  "timeline",
  "venue_logistics",
  "enhancements",
  "pricing_summary",
  "terms",
  "acceptance_cta",
] as const;

/**
 * The staff order first (known sections only, each once), then every section
 * they did not place, in the standard order. Null when no order was saved -
 * the caller keeps its standard layout.
 */
export function proposalSectionSequence(
  order: readonly string[] | null | undefined,
): string[] | null {
  if (!order?.length) return null;
  const known = new Set<string>(PROPOSAL_SECTION_IDS);
  const placed = [...new Set(order)].filter((id) => known.has(id));
  if (placed.length === 0) return null;
  return [
    ...placed,
    ...PROPOSAL_SECTION_IDS.filter((id) => !placed.includes(id)),
  ];
}

/** Move one section up (-1) or down (+1) in a full section list. */
export function moveProposalSection(
  order: readonly string[],
  id: string,
  step: -1 | 1,
): string[] {
  const next = [...order];
  const from = next.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
