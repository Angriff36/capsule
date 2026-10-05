import type { Doc } from "../../lib/api";

// Pages call this once per row with the whole client list; an id index per
// list keeps that linear instead of scanning thousands of clients per row.
const indexes = new WeakMap<
  readonly Doc<"clients">[],
  Map<string, Doc<"clients">>
>();

function findClient(clients: readonly Doc<"clients">[], clientId: string) {
  if (clients.length < 32) return clients.find((x) => x._id === clientId);
  let index = indexes.get(clients);
  if (!index) {
    index = new Map(clients.map((client) => [String(client._id), client]));
    indexes.set(clients, index);
  }
  return index.get(clientId);
}

export function clientDisplayName(
  clientId: string | null | undefined,
  clients: Doc<"clients">[] | undefined,
): string {
  if (!clientId) return "—";
  const c = clients ? findClient(clients, clientId) : undefined;
  if (!c) return "—";
  const companyName = c.companyName?.trim();
  if (c.clientType === "company" && companyName) return companyName;
  const name = [c.givenName, c.familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || companyName || "—";
}
