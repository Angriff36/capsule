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

/** Returns operator-review candidates; it never merges or blocks registration. */
export function findProbableClientDuplicates(
  clients: Doc<"clients">[],
): ClientDuplicateCandidate[] {
  const active = clients.filter(
    (client) =>
      client.deletedAt == null &&
      client.registeredAt != null &&
      String(client.status) === "active",
  );
  const candidates: ClientDuplicateCandidate[] = [];

  for (let firstIndex = 0; firstIndex < active.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < active.length;
      secondIndex += 1
    ) {
      const first = active[firstIndex];
      const second = active[secondIndex];
      const firstName = normalize(clientName(first));
      const secondName = normalize(clientName(second));
      const firstEmail = normalize(first.email);
      const secondEmail = normalize(second.email);
      if (!firstName || !secondName || !firstEmail || !secondEmail) continue;

      const nameSimilarity = similarity(firstName, secondName);
      const emailSimilarity = similarity(firstEmail, secondEmail);
      const exactEmail = firstEmail === secondEmail;
      if (!exactEmail && !(nameSimilarity >= 0.82 && emailSimilarity >= 0.76)) {
        continue;
      }

      const confidence = exactEmail
        ? 0.82 + nameSimilarity * 0.18
        : nameSimilarity * 0.55 + emailSimilarity * 0.45;
      const reasons = [
        exactEmail ? "Same email" : "Similar email",
        nameSimilarity === 1 ? "Same name" : "Similar name",
      ];

      candidates.push({
        id: [String(first._id), String(second._id)].sort().join(":"),
        first,
        second,
        confidence,
        reasons,
      });
    }
  }

  return candidates.sort(
    (left, right) =>
      right.confidence - left.confidence || left.id.localeCompare(right.id),
  );
}
