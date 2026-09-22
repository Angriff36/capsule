import {
  canonicalJson,
  fingerprintBytes,
  type EventPacketSnapshot,
  type Fact,
  type Observation,
  type PacketIssue,
  type Section,
} from "./model";
import {
  canMarkNotApplicable,
  requiredFacts,
  requirements,
  sectionFor,
  matchesRequired,
} from "./requirements";
const hash = (v: unknown) =>
  fingerprintBytes(new TextEncoder().encode(canonicalJson(v)));
// "Buffet - Cook Onsite" and "Buffet – Cook Onsite" are one value: the dash
// style (hyphen, en dash, em dash) is a print difference, not a disagreement.
const sameText = (value: unknown) =>
  typeof value === "string" ? value.replace(/[‐‑‒–—―]/g, "-") : value;
const signature = (v: { value?: unknown; unit?: string }) =>
  canonicalJson({
    value: sameText(v.value),
    unit: v.unit?.trim().toLowerCase(),
  });
const sorted = (values: unknown[]) => values.map(canonicalJson).sort();
const operational = (key: string) =>
  !key.startsWith("sourceContent.") &&
  !key.startsWith("source.") &&
  key !== "sourceStatus";
export function fieldLabel(key: string): string {
  const exact: Record<string, string> = {
    invoiceNumber: "Invoice number",
    eventDate: "Event date",
    eventTitle: "Event title",
    guestCount: "Guest count",
    serviceStyle: "Service style",
    clientName: "Client name",
  };
  if (exact[key]) return exact[key];
  const words = key
    .replace(/^menu\.required\./, "Menu ")
    .replace(/^menu\./, "")
    .replace(/^production\./, "Production ")
    .replace(
      /^timeline\.([^.]*)\.(\d+)\./,
      (_, name, visit) => `${name} visit ${visit} `,
    )
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\bnlt\b/i, "NLT");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function allowedKinds(key: string): string[] {
  if (["invoiceNumber", "eventDate", "eventTitle", "guestCount"].includes(key))
    return ["worksheet", "beo", "packlist_csv", "event_menu"];
  if (key === "serviceStyle")
    return ["worksheet", "beo", "packlist_csv", "event_tracker"];
  if (/^(clientName|contact\.|venue\.|notes\.|timeline\.)/.test(key))
    return ["worksheet", "beo"];
  if (key.startsWith("menu."))
    return ["worksheet", "beo", "event_menu", "menu_production"];
  if (key.startsWith("production.")) return ["menu_production"];
  if (key.startsWith("packlist."))
    return ["packlist_csv", "packlist_item_type", "packlist_category"];
  return [];
}
function dependent(key: string, section: Section, field: string): boolean {
  if (!operational(field)) return false;
  if (
    ["invoiceNumber", "eventDate", "serviceStyle", "guestCount"].includes(field)
  )
    return true;
  if (/signature|takeoff-readiness|wrapup|quartermaster.signoff/.test(key))
    return true;
  if (section === "packlist" || section === "equipment")
    return /^(menu\.|production\.|packlist\.|notes\.|vehicle|trailer)/.test(
      field,
    );
  return sectionFor(field) === section;
}
const uniqueEvidence = (items: Observation[]) =>
  Array.from(
    new Map(
      items.flatMap((o) => o.evidence).map((e) => [canonicalJson(e), e]),
    ).values(),
  );
function checkObservations(
  key: string,
  section: Section,
  observations: Observation[],
): Observation[] {
  const facts = observations.filter(
    (o) => !o.fieldKey.startsWith("sourceContent."),
  );
  if (key === "check.menu.components")
    return facts.filter((o) => /^menu\..*\.(notes|quantity)$/.test(o.fieldKey));
  if (key === "check.menu.unit-conversion")
    return facts.filter((o) => {
      if (!/^(menu|production|packlist)\..*\.quantity$/.test(o.fieldKey))
        return false;
      const nameKey = o.fieldKey.replace(/\.quantity$/, ".name");
      const name = facts.find((f) => f.fieldKey === nameKey)?.value;
      return /dessert|brownie|cookie/i.test(String(name ?? o.fieldKey));
    });
  if (key === "check.production.placeholders")
    return facts.filter(
      (o) =>
        o.fieldKey.startsWith("production.") && String(o.value).includes("***"),
    );
  if (key === "check.timeline.load-travel")
    return facts.filter(
      (o) => o.fieldKey.startsWith("timeline.") && o.fieldKey.endsWith(".time"),
    );
  return facts.filter((o) => sectionFor(o.fieldKey) === section);
}
export function readiness(
  snapshot: EventPacketSnapshot,
  section?: Section,
): boolean {
  return (
    requiredFacts
      .filter((r) => !section || r.section === section)
      .every((r) =>
        snapshot.facts.some(
          (f) =>
            matchesRequired(f.fieldKey, r.fieldKey) &&
            f.status === "confirmed" &&
            f.value !== undefined,
        ),
      ) &&
    requirements
      .filter((r) => !section || r.section === section)
      .every((r) =>
        snapshot.issues.some(
          (i) =>
            i.key === r.key &&
            i.status === "resolved" &&
            snapshot.resolutions.some(
              (d) =>
                d.issueId === i.id &&
                d.evidenceFingerprint === i.evidenceFingerprint &&
                snapshot.checklistVerifications.some(
                  (c) =>
                    c.checkKey === r.key &&
                    c.actor === d.actor &&
                    c.at === d.at &&
                    (c.answer === "yes" ||
                      (c.answer === "not_applicable" &&
                        canMarkNotApplicable(r, snapshot))),
                ),
            ),
        ),
      ) &&
    !snapshot.issues.some(
      (i) =>
        i.required &&
        i.status === "open" &&
        (!section || i.section === section),
    )
  );
}
/** Pure reconciliation: no clock, writes, external approval, or native-domain mutation. */
export async function reconcile(
  snapshot: EventPacketSnapshot,
  currentEvent?: Fact[],
): Promise<EventPacketSnapshot> {
  const native = (
    currentEvent ??
    snapshot.facts.filter((f) => f.authority === "native_finalized")
  ).filter(
    (f) => f.authority === "native_finalized" && f.status === "confirmed",
  );
  const groups = new Map<string, Observation[]>();
  for (const o of snapshot.observations) {
    const g = groups.get(o.fieldKey) ?? [];
    g.push(o);
    groups.set(o.fieldKey, g);
  }
  const present = [...groups.keys(), ...native.map((f) => f.fieldKey)];
  const fields = [
    ...new Set([
      ...present,
      ...requiredFacts
        .filter((r) => !present.some((f) => matchesRequired(f, r.fieldKey)))
        .map((r) => r.fieldKey),
    ]),
  ].sort();
  const facts: Fact[] = [],
    issues: PacketIssue[] = [];
  for (const fieldKey of fields) {
    const obs = groups.get(fieldKey) ?? [],
      authority = native.find((f) => f.fieldKey === fieldKey),
      variants = new Set(obs.map(signature));
    const evidence = uniqueEvidence(obs);
    const authoritative = evidence.filter((e) => {
      const kind = snapshot.artifacts.find(
        (a) => a.fingerprint === e.artifactFingerprint,
      )?.kind;
      return kind && allowedKinds(fieldKey).includes(kind);
    });
    const agreement =
      new Set(authoritative.map((e) => e.artifactFingerprint)).size >= 2 &&
      !/^(vehicle|trailer|crew|signature|approval)/.test(fieldKey);
    let fact: Fact = authority
      ? { ...authority, evidence: authority.evidence }
      : obs.length
        ? {
            fieldKey,
            value: variants.size === 1 ? obs[0].value : undefined,
            unit: variants.size === 1 ? obs[0].unit : undefined,
            status:
              variants.size > 1
                ? "conflicted"
                : agreement
                  ? "confirmed"
                  : "candidate",
            evidence,
            confidence: variants.size > 1 ? 0 : 0.8,
            ...(variants.size === 1 && agreement
              ? { authority: "source_agreement" as const }
              : {}),
          }
        : { fieldKey, status: "missing", evidence: [], confidence: 0 };
    const disagreement = authority
      ? obs.some((o) => signature(o) !== signature(authority))
      : variants.size > 1;
    const essential = requiredFacts.some((r) =>
      matchesRequired(fieldKey, r.fieldKey),
    );
    const material =
      essential ||
      /^(timeline\..*\.time|menu\..*\.quantity|packlist\..*\.quantity|production\..*\.quantity|vehicle|trailer|crew)/.test(
        fieldKey,
      );
    // Single-source recipe/packing rows remain labeled references, not hundreds of manufactured approvals.
    const needsReview =
      operational(fieldKey) &&
      ((disagreement && (material || !!authority)) ||
        (essential && fact.status !== "confirmed"));
    if (needsReview) {
      const key = "fact." + fieldKey;
      const evidenceFingerprint = await hash({
        fieldKey,
        observations: sorted(
          obs.map((o) => ({
            value: o.value,
            unit: o.unit,
            evidence: sorted(o.evidence),
          })),
        ),
        native: authority,
      });
      const old = snapshot.issues.find((i) => i.key === key);
      const resolution = snapshot.resolutions
        .filter(
          (r) =>
            r.issueId === (old?.id ?? key) &&
            r.evidenceFingerprint === evidenceFingerprint,
        )
        .at(-1);
      const supported = resolution?.observationId
        ? obs.find(
            (o) =>
              o.id === resolution.observationId &&
              canonicalJson(o.value) === canonicalJson(resolution.choice) &&
              o.unit === resolution.unit,
          )
        : undefined;
      const nativeChoice =
        resolution &&
        authority &&
        signature({ value: resolution.choice, unit: resolution.unit }) ===
          signature(authority);
      const entry =
        resolution?.kind === "fact_entry" && !!resolution.reason.trim();
      const resolved =
        !!resolution && (authority ? !!nativeChoice : !!supported || entry);
      if (resolved && !authority && supported)
        fact = {
          fieldKey,
          value: supported.value,
          unit: supported.unit,
          status: "confirmed",
          authority: "human_verified",
          evidence: supported.evidence,
          confidence: 1,
        };
      if (resolved && !authority && entry)
        fact = {
          fieldKey,
          value: resolution!.choice,
          unit: resolution!.unit,
          status: "confirmed",
          authority: "human_verified",
          evidence: resolution!.evidence ?? [],
          confidence: 1,
        };
      issues.push({
        id: old?.id ?? key,
        key,
        fieldKey,
        required: !fieldKey.startsWith("sourceContent."),
        severity: "blocking",
        section: sectionFor(fieldKey),
        printSection: sectionFor(fieldKey),
        owner: "Operations / source owner",
        message: disagreement
          ? `Resolve conflicting ${fieldLabel(fieldKey)}: ${obs.map((o) => `${o.value}${o.unit ? " " + o.unit : ""}`).join(" / ")}${authority ? `; current native value ${authority.value} ${authority.unit ?? ""}` : ""}`
          : `Confirm ${fieldLabel(fieldKey)}${obs.length ? " from its source evidence" : "; required value is missing"}`,
        status: resolved ? "resolved" : "open",
        evidence,
        evidenceFingerprint,
        ...(resolved ? { verifiedAt: resolution!.at } : {}),
      });
    }
    facts.push(fact);
  }
  for (const r of requirements) {
    const evidenceFingerprint = await hash({
      check: r.key,
      identity: snapshot.identity,
      observations: sorted(
        snapshot.observations
          .filter((o) => dependent(r.key, r.section, o.fieldKey))
          .map((o) => ({ fieldKey: o.fieldKey, value: o.value, unit: o.unit })),
      ),
      facts: sorted(
        facts
          .filter((f) => dependent(r.key, r.section, f.fieldKey))
          .map((f) => ({
            fieldKey: f.fieldKey,
            value: f.value,
            unit: f.unit,
            status: f.status,
          })),
      ),
      reports: r.key.startsWith("check.report.")
        ? snapshot.artifacts
            .filter((a) => a.kind === r.key.slice("check.report.".length))
            .map((a) => a.fingerprint)
            .sort()
        : undefined,
    });
    const old = snapshot.issues.find((i) => i.key === r.key);
    const id = old?.id ?? r.key;
    const resolution = snapshot.resolutions
      .filter(
        (d) =>
          d.issueId === id && d.evidenceFingerprint === evidenceFingerprint,
      )
      .at(-1);
    const check = snapshot.checklistVerifications.find(
      (c) => c.checkKey === r.key,
    );
    const resolved =
      !!resolution &&
      !!check &&
      resolution.actor === check.actor &&
      resolution.at === check.at &&
      (check.answer === "yes" ||
        (check.answer === "not_applicable" &&
          canMarkNotApplicable(r, snapshot)));
    const relevant = checkObservations(r.key, r.section, snapshot.observations);
    const context = [
      "check.timeline.load-travel",
      "check.menu.components",
      "check.menu.unit-conversion",
      "check.production.placeholders",
    ].includes(r.key)
      ? Array.from(
          new Set(
            relevant.map((o) => {
              const name =
                r.key === "check.menu.unit-conversion"
                  ? snapshot.observations.find(
                      (f) =>
                        f.fieldKey ===
                        o.fieldKey.replace(/\.quantity$/, ".name"),
                    )?.value
                  : undefined;
              return `${name ?? fieldLabel(o.fieldKey)}: ${o.value}${o.unit ? " " + o.unit : ""}`;
            }),
          ),
        ).join("; ")
      : "";
    issues.push({
      id,
      key: r.key,
      fieldKey: r.fieldKey,
      required: true,
      severity: "blocking",
      section: r.section,
      printSection: r.printSection,
      owner: r.owner,
      message: r.message + (context ? " — " + context : ""),
      status: resolved ? "resolved" : "open",
      evidence: uniqueEvidence(relevant),
      evidenceFingerprint,
      ...(resolved ? { verifiedAt: resolution!.at } : {}),
    });
  }
  // Keep retired issues for audit references; no historical resolution becomes dangling.
  for (const old of snapshot.issues)
    if (!issues.some((i) => i.id === old.id))
      issues.push({ ...old, required: false, severity: "info" });
  const next: EventPacketSnapshot = {
    ...snapshot,
    facts,
    issues,
    stage: "review",
  };
  next.stage = readiness(next) ? "ready" : "review";
  return next;
}
