import type {
  Observation,
  FieldValue,
  EventIdentity,
  EvidenceReference,
} from "./model";
import {
  type ExtractedSource,
  sourceIdentity,
  sourceContactName,
  referenceKinds,
} from "./groupSources";
export const fieldSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const time24 = (s: string) => {
  const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)!;
  return `${String((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${m[2]}`;
};
export function extractObservations(
  source: ExtractedSource,
  identity?: EventIdentity,
): Observation[] {
  const { artifact } = source,
    out: Observation[] = [];
  if (
    referenceKinds.has(artifact.kind) ||
    ["kitchen_shift", "unknown"].includes(artifact.kind)
  )
    return out;
  const occurrenceCounts = new Map<string, number>();
  const add = (
    fieldKey: string,
    value: FieldValue,
    location: Partial<EvidenceReference>,
    unit?: string,
  ) => {
    const evidence = {
      artifactFingerprint: artifact.fingerprint,
      parserVersion: artifact.parserVersion,
      ...location,
    };
    const baseId = `${artifact.fingerprint}:${fieldKey}:${location.page ?? ""}:${location.row ?? ""}:${location.cell ?? ""}`;
    const occurrence = (occurrenceCounts.get(baseId) ?? 0) + 1;
    occurrenceCounts.set(baseId, occurrence);
    out.push({
      id: `${baseId}:${occurrence}`,
      fieldKey,
      value,
      ...(unit ? { unit } : {}),
      evidence: [evidence],
      observedAt: artifact.importedAt,
    });
  };
  const direct = sourceIdentity(source);
  if (direct) {
    add(
      "invoiceNumber",
      direct.invoiceNumber,
      source.rows ? { row: 5, cell: "2" } : { page: 1 },
    );
    add(
      "eventDate",
      direct.eventDate,
      source.rows ? { row: 1, cell: "3" } : { page: 1 },
    );
  }
  if (source.rows) {
    let category = "",
      section = "";
    source.rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const loc = { row: ri + 1, cell: String(ci + 1) };
        const next = row[ci + 1];
        const keys: Record<string, string> = {
          "Event Title:": "eventTitle",
          "Guest Count:": "guestCount",
          "Service Style:": "serviceStyle",
          "Status:": "sourceStatus",
        };
        if (cell.trim() === "Contact:" && next) {
          const colon = next.lastIndexOf(":");
          add(
            "contact.name",
            colon >= 0 ? next.slice(0, colon).trim() : next.trim(),
            { row: ri + 1, cell: String(ci + 2) },
          );
          if (colon >= 0)
            add("clientName", next.slice(colon + 1).trim(), {
              row: ri + 1,
              cell: String(ci + 2),
            });
        }
        if (keys[cell.trim()] && next)
          add(
            keys[cell.trim()],
            keys[cell.trim()] === "guestCount" ? Number(next) : next,
            { row: ri + 1, cell: String(ci + 2) },
          );
        const m = cell.match(
          /^\s*\(([\d.]+)\s+([^)]*)\)\s*(?:\|([^|]*)\|\s*)?(.*)$/,
        );
        if (m) {
          const key = `packlist.r${ri + 1}c${ci + 1}`;
          add(key + ".quantity", Number(m[1]), loc, m[2]);
          add(key + ".name", m[4], loc);
          add(key + ".category", category || section, loc);
          if (m[3]) add(key + ".stockCode", m[3], loc);
          const association =
            source.rows?.[ri + 1]?.[ci]?.match(/^For:\s*(.*)/i);
          if (association)
            add(key + ".for", association[1], {
              row: ri + 2,
              cell: String(ci + 1),
            });
        }
      });
      if (
        row.length === 1 &&
        !/^\s*(?:\(|For:|Grouped|Pack List)/i.test(row[0])
      ) {
        if (/^(Equipment|Food)$/.test(row[0])) section = row[0];
        else category = row[0].trim();
      }
    });
    return out;
  }
  const timelineCounts: Record<string, number> = {};
  for (const p of source.pages) {
    const t = p.text,
      loc = { page: p.page };
    const stamp =
      "(\\d{1,2}/\\d{1,2}/\\d{4}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*[AP]M)?)";
    const recorded =
      t.match(new RegExp(stamp + "\\s*Last Changed:", "i"))?.[1] ??
      t.match(new RegExp("Last Changed:\\s*" + stamp, "i"))?.[1] ??
      t.match(
        new RegExp("(?:Printed Date|Date Printed):\\s*" + stamp, "i"),
      )?.[1];
    if (recorded) add("source.recordedTime", recorded, loc);
    if (artifact.kind === "event_tracker") {
      if (!identity) continue;
      for (const row of p.sourceRows ?? []) {
        const m = row.text.match(
          /(Bring Hot|Drop Off|Full Service|Cook(?:ed)? Onsite|Limited Service)/i,
        );
        if (m) add("serviceStyle", m[1], { ...loc, row: row.row });
      }
      continue;
    }
    const service = t.match(/Service Style:\s*([^\n]+)/i)?.[1];
    if (service) add("serviceStyle", service.trim(), loc);
    const guests =
      t.match(/Guest Count:\s*(\d+)/i)?.[1] ??
      t.match(/(?:^|\n)(\d+)\s*\*\*[^\n]*Guest Count:/i)?.[1];
    if (guests) add("guestCount", Number(guests), loc);
    const title =
      artifact.kind === "beo"
        ? t.match(/(?:^|\n)([^\n]+?)[ \t]+Event Time:/i)?.[1]
        : t.match(/(?:^|\n)Event Title:[ \t]*([^\n]+?)(?=Invoice|\n|$)/i)?.[1];
    if (title) add("eventTitle", title.trim(), loc);
    const status = t.match(/Status:[ \t]*([^\n]+)/i)?.[1];
    if (status) add("sourceStatus", status.trim(), loc);
    if (artifact.kind === "worksheet" || artifact.kind === "beo") {
      const contact = sourceContactName(artifact.kind, t);
      if (contact) add("contact.name", contact.trim(), loc);
      const phone = t.match(/(?:^|\n)Cell:[ \t]*([^\n]+)/)?.[1];
      if (phone) add("contact.phone", phone.trim(), loc);
      const contactBlock =
        artifact.kind === "beo"
          ? t.match(/(?:^|\n)Location:([\s\S]*?)(?:\nContact:)/)?.[1]
          : t.match(/(?:^|\n)Contact:([\s\S]*?)(?:\nVenue:)/)?.[1];
      const email = contactBlock?.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
      if (email) add("contact.email", email, loc);
      const venue =
        artifact.kind === "beo"
          ? t.match(/Guest Count:[ \t]*\n([^\n]+)\n/)?.[1]
          : t.match(/(?:^|\n)Venue:[ \t]*([^\n]+)/)?.[1];
      if (venue) add("venue.name", venue.trim(), loc);
      const address =
        artifact.kind === "beo"
          ? t.match(/Guest Count:[ \t]*\n[^\n]+\n([^\n]+\n[^\n]+)/)?.[1]
          : t.match(/(?:^|\n)Venue:[ \t]*[^\n]+\n([^\n]+\n[^\n]+)/)?.[1];
      if (address) add("venue.address", address.trim(), loc);
      const client =
        artifact.kind === "beo"
          ? t.match(/(?:^|\n)([^\n]+?)[ \t]*Company:/)?.[1]
          : t.match(/(?:^|\n)Contact:[^\n]+\n([^\n]+)/)?.[1];
      if (client) add("clientName", client.trim(), loc);
    }
    const setup = t.match(
      /(?:Setup Notes|\nSetup\n)([\s\S]*?)(?=Printed Date:|$)/,
    )?.[1];
    if (setup) add("notes.setup", setup.trim(), loc);
    const access = t.match(/Staff will need[^\n]*(?:\n(?:a )?badge[^\n]*)?/g);
    if (access)
      add(
        "notes.access",
        [...new Set(access.map((x) => x.replace(/\n/g, " ")))],
        loc,
      );
    // Both TPP orientations occur: worksheet label first, BEO time first.
    const names =
      "Event Staff On|NLT|Arrive Onsite|Checked in with Security|Room Fully Set|Event Start|Return to Mangia HQ|Event End|Event Staff Off";
    for (const line of t.split("\n")) {
      const m = line.match(
        new RegExp(
          `^\\s*(?:(${names})\\s+(\\d{1,2}:\\d{2}\\s*[AP]M)|(\\d{1,2}:\\d{2}\\s*[AP]M)\\s+(${names}))(.*)$`,
          "i",
        ),
      );
      if (!m) continue;
      const label = fieldSlug(m[1] ?? m[4]).replaceAll("-", "_");
      const n = (timelineCounts[label] = (timelineCounts[label] ?? 0) + 1);
      const key = `timeline.${label}.${n}`;
      add(key + ".time", time24(m[2] ?? m[3]), loc);
      if (m[5].trim()) add(key + ".notes", m[5].trim(), loc);
    }
    if (artifact.kind === "beo")
      for (const m of t.matchAll(
        /-\s*(\d+(?:\.\d+)?)\s+(Serving|Each)\s+([^\n]+)/g,
      )) {
        const key = `menu.${fieldSlug(m[3])}`;
        add(key + ".name", m[3].trim(), loc);
        add(key + ".quantity", Number(m[1]), loc, m[2]);
      }
    if (artifact.kind === "worksheet" && p.page > 1) {
      const lines = t.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(.+?)\s+(\d+)$/);
        if (m && !/^\d|Printed|Page/.test(m[1])) {
          const key = `menu.${fieldSlug(m[1])}`;
          add(key + ".name", m[1], loc);
          add(key + ".quantity", Number(m[2]), loc, "unspecified");
        } else if (/^\d+$/.test(lines[i]) && i > 0) {
          const name = lines
            .slice(0, i)
            .find((x) => /\s\d+\s+Trays/i.test(x))
            ?.replace(/\s+\d+\s+Trays.*$/i, "");
          if (name) {
            add(`menu.${fieldSlug(name)}.name`, name, loc);
            add(
              `menu.${fieldSlug(name)}.quantity`,
              Number(lines[i]),
              loc,
              "unspecified",
            );
          }
        }
      }
    }
    if (artifact.kind === "menu_production") {
      const normalized = t
        .replace(/\nSMALL\n/g, " SMALL\n")
        .replace(/\nPACKAGED\)/g, " PACKAGED)");
      for (const m of normalized.matchAll(
        /(?:Finish at Kitchen|Drop Off - Individual)\s+([\s\S]*?)P:\s*([\d.]+)\s+([^\n]+)/g,
      )) {
        const lines = m[1].split("\n");
        const name = lines[0].trim();
        const key = `menu.${fieldSlug(name)}`;
        add(key + ".name", name, loc);
        add(key + ".quantity", Number(m[2]), loc, m[3].trim());
        if (lines.slice(1).join("\n").trim())
          add(key + ".notes", lines.slice(1).join("\n").trim(), loc);
      }
      for (const m of t.matchAll(
        /(?:^|\n)([\d.]+)\s+(\w+)\s+((?:MAKE|PORTION|ORDER|BAKE|ASSEMBLE|CUT|PROOF|BUILD)[^\n]*)/g,
      )) {
        const key = `production.${fieldSlug(m[3])}`;
        add(key + ".name", m[3], loc);
        add(key + ".quantity", Number(m[1]), loc, m[2]);
      }
    }
    if (
      ["worksheet", "beo", "event_menu", "menu_production"].includes(
        artifact.kind,
      )
    )
      add(`sourceContent.${artifact.kind}.page${p.page}`, t, loc);
    for (const m of t.matchAll(/(\d+)\s+(Trays)\s+of\s+([^\n]+)/gi)) {
      add(`components.${fieldSlug(m[3])}.quantity`, Number(m[1]), loc, m[2]);
    }
  }
  return out;
}
