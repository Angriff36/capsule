/** "Event pack list" is the name every list gets when it is opened; it says
 *  nothing, so a list keeps its own name and otherwise takes its event's. */
export function packListName(
  name: string | null | undefined,
  eventTitle?: string | null,
): string {
  const own = name?.trim();
  if (own && own !== "Event pack list") return own;
  return eventTitle ? `${eventTitle} pack list` : "Pack list";
}
