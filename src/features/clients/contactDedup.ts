import type { Doc } from "../../lib/api";
import { clientDisplayName } from "../events/clientName";

export interface ClientDuplicateCandidate {
  id: string;
  first: Doc<"clients">;
  second: Doc<"clients">;
  confidence: number;
  reasons: string[];
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string): number {
  if (!left) return right.length;
  if (!right) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(
        Math.min(
          current[rightIndex] + 1,
          previous[rightIndex + 1] + 1,
          previous[rightIndex] +
            (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  return 1 - editDistance(left, right) / Math.max(left.length, right.length);
}

function clientName(client: Doc<"clients">): string {
  return clientDisplayName(client._id, [client]);
}

/** Neighbors compared on each side of a client after sorting by name, then by
 *  email. Near-identical strings sort next to each other, so this finds the
 *  same pairs as comparing everyone with everyone without the n² cost that
 *  froze the Clients page at a few thousand clients. */
const SORTED_NEIGHBOR_WINDOW = 10;

/** Returns operator-review candidates; it never merges or blocks registration. */
export function findProbableClientDuplicates(
  clients: Doc<"clients">[],
): ClientDuplicateCandidate[] {
  const active = clients
    .filter(
      (client) =>
        client.deletedAt == null &&
        client.registeredAt != null &&
        String(client.status) === "active",
    )
    .map((client, index) => ({
      index,
      client,
      name: normalize(clientName(client)),
      email: normalize(client.email),
    }))
    .filter((row) => row.name && row.email);
  type Row = (typeof active)[number];

  const pairs = new Map<string, [Row, Row]>();
  const consider = (first: Row, second: Row) => {
    const id = [String(first.client._id), String(second.client._id)]
      .sort()
      .join(":");
    if (!pairs.has(id)) pairs.set(id, [first, second]);
  };
  // Same email always pairs, wherever it sorts.
  const byEmail = new Map<string, Row[]>();
  for (const row of active) {
    byEmail.set(row.email, [...(byEmail.get(row.email) ?? []), row]);
  }
  for (const group of byEmail.values()) {
    for (let i = 0; i < group.length; i += 1)
      for (let j = i + 1; j < group.length; j += 1)
        consider(group[i], group[j]);
  }
  for (const key of ["name", "email"] as const) {
    const sorted = [...active].sort((a, b) => a[key].localeCompare(b[key]));
    for (let i = 0; i < sorted.length; i += 1)
      for (
        let j = i + 1;
        j < Math.min(sorted.length, i + 1 + SORTED_NEIGHBOR_WINDOW);
        j += 1
      )
        consider(sorted[i], sorted[j]);
  }

  const candidates: ClientDuplicateCandidate[] = [];
  for (const [id, [firstRow, secondRow]] of pairs) {
    const exactEmail = firstRow.email === secondRow.email;
    const nameSimilarity = similarity(firstRow.name, secondRow.name);
    if (!exactEmail && nameSimilarity < 0.82) continue;
    const emailSimilarity = similarity(firstRow.email, secondRow.email);
    if (!exactEmail && emailSimilarity < 0.76) continue;

    const [first, second] =
      firstRow.index < secondRow.index
        ? [firstRow.client, secondRow.client]
        : [secondRow.client, firstRow.client];
    const confidence = exactEmail
      ? 0.82 + nameSimilarity * 0.18
      : nameSimilarity * 0.55 + emailSimilarity * 0.45;
    const reasons = [
      exactEmail ? "Same email" : "Similar email",
      nameSimilarity === 1 ? "Same name" : "Similar name",
    ];
    candidates.push({ id, first, second, confidence, reasons });
  }

  return candidates.sort(
    (left, right) =>
      right.confidence - left.confidence || left.id.localeCompare(right.id),
  );
}
