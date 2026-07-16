import type { Doc } from "../../lib/api";

export function clientDisplayName(
  clientId: string | null | undefined,
  clients: Doc<"clients">[] | undefined,
): string {
  if (!clientId) return "—";
  const c = clients?.find((x) => x._id === clientId);
  if (!c) return "—";
  if (c.clientType === "company" && c.companyName) return c.companyName;
  const name = [c.givenName, c.familyName].filter(Boolean).join(" ");
  return name || c.companyName || "—";
}
