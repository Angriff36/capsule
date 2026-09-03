import type { Doc } from "../../lib/api";

export function clientDisplayName(
  clientId: string | null | undefined,
  clients: Doc<"clients">[] | undefined,
): string {
  if (!clientId) return "—";
  const c = clients?.find((x) => x._id === clientId);
  if (!c) return "—";
  const companyName = c.companyName?.trim();
  if (c.clientType === "company" && companyName) return companyName;
  const name = [c.givenName, c.familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || companyName || "—";
}
