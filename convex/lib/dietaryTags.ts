// TPP's one "Tags" column mixes diet words (vegan, gluten free) with kitchen
// and sales labels (pizza, drop off, sel24, finish kitchen). Only diet words
// are diet tags: a label must never read as a diet on the allergen briefing
// or the client's menu. A word a person typed that is not a known label stays.
const NOT_A_DIET_TAG =
  /^(?:finish(?: at)? (?:event|kitchen)|day of|passed(?: apps?)?|stationary apps?|drop ?off|vending|action station|buffet.*|plated|family style|individual|sel\s*\d*|ready to heat|air catering|ezcater|pizza|salad dressing|traditional|italian|(?:sub[- ]?)?recipe|prep(?: item)?|garnish|cook on ?site)$/i;

export function isDietTag(tag: string): boolean {
  const text = tag.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return text !== "" && !NOT_A_DIET_TAG.test(text);
}

export function dietTagsOnly(
  tags: readonly string[] | null | undefined,
): string[] {
  return (tags ?? []).filter(isDietTag);
}
