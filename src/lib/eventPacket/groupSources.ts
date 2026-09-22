import { identityKey, type SourceArtifact, type EventIdentity } from "./model";
export interface SourcePage {
  page: number;
  text: string;
  sourceRows?: { row: number; text: string }[];
}
export interface ExtractedSource {
  artifact: SourceArtifact;
  tenantId: string;
  pages: SourcePage[];
  rows?: string[][];
}
export interface PacketCandidate {
  key: string;
  identity: EventIdentity;
  sources: ExtractedSource[];
  associationEvidence: string[];
}
export function sourceText(s: ExtractedSource) {
  return (
    s.pages.map((p) => p.text).join("\n") +
    "\n" +
    (s.rows?.map((r) => r.join(" ")).join("\n") ?? "")
  );
}
const datePattern = "\\d{1,2}/\\d{1,2}/(?:20\\d{2}|\\d{2})";
export function isoDate(t: string): string | undefined {
  const m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})/);
  if (!m) return;
  const year = Number(m[3].length === 2 ? "20" + m[3] : m[3]),
    month = Number(m[1]),
    day = Number(m[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return;
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
function identityText(s: ExtractedSource) {
  return sourceText(s).split(/Printed Date:|Date Printed:|Print Date:/i)[0];
}
/** Only labeled event-date evidence or the recognized TPP header orientation counts. */
export function sourceEventDate(s: ExtractedSource): string | undefined {
  const t = identityText(s);
  const dates: string[] = [];
  const collect = (re: RegExp) => {
    for (const m of t.matchAll(re)) {
      const date = isoDate(m[1]);
      if (date) dates.push(date);
    }
  };
  collect(new RegExp("Event Date:\\s*(" + datePattern + ")", "gi"));
  if (s.artifact.kind === "worksheet")
    collect(
      new RegExp(
        "(" +
          datePattern +
          ")[ \\t]*(?:-[ \\t]*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))?[ \\t]*Event Date:",
        "gi",
      ),
    );
  if (s.artifact.kind === "beo") {
    collect(
      new RegExp(
        "(" + datePattern + ")\\s*\\d+\\s*Invoice\\s*#:\\s*Date:",
        "gi",
      ),
    );
    // The .rtf BEO keeps reading order: "Invoice #: 5935 Date: Saturday 9/26/2026".
    collect(
      new RegExp(
        "Invoice\\s*#:\\s*\\d+\\s+Date:\\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s*)?(" +
          datePattern +
          ")",
        "gi",
      ),
    );
  }
  if (s.artifact.kind === "menu_production")
    collect(
      new RegExp(
        "On:\\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s*)?(" +
          datePattern +
          ")",
        "gi",
      ),
    );
  const unique = [...new Set(dates)];
  return unique.length === 1 ? unique[0] : undefined;
}
export function sourceIdentity(s: ExtractedSource): EventIdentity | undefined {
  const t = identityText(s);
  const explicit = [...t.matchAll(/Invoice\s*#\s*:?\s*(\d+)/gi)].map(
    (m) => m[1],
  );
  const inverse =
    s.artifact.kind === "beo"
      ? t.match(
          /\d{1,2}\/\d{1,2}\/20\d{2}[ \t]*(\d+)[ \t]*Invoice\s*#:[ \t]*Date:/i,
        )?.[1]
      : undefined;
  if (inverse) explicit.push(inverse);
  const invoices = [...new Set(explicit)];
  const date = sourceEventDate(s);
  return invoices.length === 1 && date
    ? { tenantId: s.tenantId, invoiceNumber: invoices[0], eventDate: date }
    : undefined;
}
export const referenceKinds = new Set([
  "ops_final_lock",
  "quartermaster",
  "event_forms",
  "training",
]);
const normalize = (s: string) =>
  s
    .replace(/\[REDACTED[^\]]*\]/gi, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Shared supported contact layouts keep association and evidence extraction aligned. */
export function sourceContactName(
  kind: SourceArtifact["kind"],
  text: string,
): string | undefined {
  const reverse =
    kind === "beo"
      ? text.match(/(?:^|\n)Location:\s*([^\n]+)\nCell:/i)?.[1]
      : undefined;
  return (
    reverse ?? text.match(/(?:^|\n)Contact:[ \t]*([^\n]+)/i)?.[1]
  )?.trim();
}
/** Names are extracted from identity labels only, never menu descriptions or notes. */
function labeledNames(s: ExtractedSource): { client: string; contact: string } {
  const t = identityText(s);
  let client = "",
    contact = "";
  if (s.artifact.kind === "event_menu") {
    const line =
      t
        .match(/Prepared for:\s*([^\n]*)/i)?.[1]
        ?.replace(new RegExp("Event Date:\\s*" + datePattern, "i"), "")
        .trim() ?? "";
    const colon = line.lastIndexOf(":");
    if (colon >= 0) {
      contact = line.slice(0, colon);
      client = line.slice(colon + 1);
    } else contact = line;
  } else if (s.artifact.kind === "worksheet") {
    const m = t.match(/(?:^|\n)Contact:[ \t]*([^\n]+)\n([^\n]+)/i);
    contact = sourceContactName(s.artifact.kind, t) ?? "";
    client = m?.[2] ?? "";
  } else if (s.artifact.kind === "beo") {
    client = t.match(/(?:^|\n)([^\n]+?)\s*Company:/i)?.[1] ?? "";
    contact = sourceContactName(s.artifact.kind, t) ?? "";
  }
  const explicitlyLabeledClient = t.match(
    /(?:^|\n)(?:Client|Company):[ \t]*([^\n]+)/i,
  )?.[1];
  if (explicitlyLabeledClient) client = explicitlyLabeledClient;
  return { client: normalize(client), contact: normalize(contact) };
}
export function groupSources(sources: ExtractedSource[]) {
  const candidates: PacketCandidate[] = [],
    sharedReferences: ExtractedSource[] = [],
    ungrouped: ExtractedSource[] = [],
    identityReviews: {
      source: ExtractedSource;
      reason: string;
      candidateKeys: string[];
    }[] = [];
  const pending: ExtractedSource[] = [];
  for (const s of sources) {
    if (referenceKinds.has(s.artifact.kind)) {
      sharedReferences.push(s);
      continue;
    }
    if (["unknown", "kitchen_shift"].includes(s.artifact.kind)) {
      ungrouped.push(s);
      continue;
    }
    if (s.artifact.kind === "event_tracker") {
      pending.push(s);
      continue;
    }
    const identity = sourceIdentity(s);
    if (!identity) {
      pending.push(s);
      continue;
    }
    const key = identityKey(identity);
    let c = candidates.find((c) => c.key === key);
    if (!c) {
      c = { key, identity, sources: [], associationEvidence: [] };
      candidates.push(c);
    }
    if (
      !c.sources.some((x) => x.artifact.fingerprint === s.artifact.fingerprint)
    )
      c.sources.push(s);
  }
  for (const s of pending) {
    let matches: PacketCandidate[] = [];
    let ambiguousKeys: string[] = [];
    if (s.artifact.kind === "event_tracker") {
      const scoped = new Map<string, SourcePage[]>();
      for (const p of s.pages)
        for (const row of p.sourceRows ??
          p.text.split("\n").map((text, i) => ({ row: i + 1, text }))) {
          const date = row.text.match(
            /^\s*(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\s+/,
          );
          if (!date) continue;
          const eligible = candidates.filter((c) => {
            const [year, month, day] = c.identity.eventDate.split("-");
            return (
              c.identity.tenantId === s.tenantId &&
              Number(date[1]) === Number(month) &&
              Number(date[2]) === Number(day) &&
              (!date[3] ||
                Number(date[3].length === 2 ? "20" + date[3] : date[3]) ===
                  Number(year)) &&
              new RegExp(
                `^${c.identity.invoiceNumber}(?=\\d{1,2}:|\\s|$)`,
              ).test(row.text.slice(date[0].length))
            );
          });
          if (eligible.length > 1) {
            ambiguousKeys.push(...eligible.map((c) => c.key));
            continue;
          }
          if (eligible.length !== 1) continue;
          const key = eligible[0].key,
            pages = scoped.get(key) ?? [];
          let page = pages.find((x) => x.page === p.page);
          if (!page) {
            page = { page: p.page, text: "", sourceRows: [] };
            pages.push(page);
          }
          page.sourceRows!.push(row);
          page.text = page.sourceRows!.map((r) => r.text).join("\n");
          scoped.set(key, pages);
        }
      for (const c of candidates) {
        const pages = scoped.get(c.key);
        if (pages) {
          c.sources.push({ ...s, pages });
          matches.push(c);
        }
      }
    } else if (s.artifact.kind === "event_menu") {
      const date = sourceEventDate(s),
        menu = labeledNames(s);
      matches = candidates.filter(
        (c) =>
          c.identity.tenantId === s.tenantId &&
          c.identity.eventDate === date &&
          (() => {
            const names = c.sources.map(labeledNames);
            const contradiction = names.some(
              (n) =>
                (menu.client && n.client && menu.client !== n.client) ||
                (menu.contact && n.contact && menu.contact !== n.contact),
            );
            const matchesName = names.some(
              (n) =>
                (!!menu.client && menu.client === n.client) ||
                (!!menu.contact && menu.contact === n.contact),
            );
            return !contradiction && matchesName;
          })(),
      );
      if (matches.length === 1) {
        matches[0].sources.push(s);
        matches[0].associationEvidence.push(
          `${s.artifact.fingerprint}: unique event date and exact normalized labeled client/contact match`,
        );
      }
    }
    if (ambiguousKeys.length) {
      ungrouped.push(s);
      identityReviews.push({
        source: s,
        reason: "Ambiguous tracker row: year or identity requires review",
        candidateKeys: [...new Set(ambiguousKeys)],
      });
    } else if (matches.length === 0) {
      ungrouped.push(s);
      identityReviews.push({
        source: s,
        reason:
          "No unique event identity match; inspect labeled event date and invoice/client/contact evidence",
        candidateKeys: [],
      });
    } else if (matches.length > 1 && s.artifact.kind !== "event_tracker") {
      ungrouped.push(s);
      identityReviews.push({
        source: s,
        reason: "Ambiguous event identity",
        candidateKeys: matches.map((c) => c.key),
      });
    }
  }
  return { candidates, sharedReferences, ungrouped, identityReviews };
}
