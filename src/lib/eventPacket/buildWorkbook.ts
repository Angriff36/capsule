import type {
  EventPacketSnapshot,
  EventIdentity,
  EvidenceReference,
  PacketIssue,
} from "./model";
import { readiness } from "./reconcile";
import { canMarkNotApplicable, requirements } from "./requirements";
import forms from "./fixtures/event-workbook.form-definitions.json";
/** A value drawn on top of an original form page at its fixed source anchor. */
export interface WorkbookOverlay {
  /** Original-page anchor: "header" for the Event Number/Date line, or a form row label prefix for Y/N answers. */
  anchor: string;
  kind: "text" | "yn" | "choice";
  value?: string;
  answer?: "yes" | "no";
  /** For kind "choice": the option text to mark (Serving Ware line). */
  option?: string;
}
export interface WorkbookSourcePage {
  file: "event-forms-one-print";
  page: number;
  overlays: WorkbookOverlay[];
}
export interface WorkbookBlock {
  kind: "text" | "heading" | "issue" | "form" | "sourcePage";
  text: string;
  small?: boolean;
  sourcePage?: WorkbookSourcePage;
}
export interface WorkbookSection {
  id: string;
  title: string;
  blocks: WorkbookBlock[];
}
export interface Workbook {
  identity: EventIdentity;
  revision: string;
  generatedAt: string;
  status: "READY" | "NEEDS ATTENTION";
  sections: WorkbookSection[];
  completeness: {
    formPages: number;
    fieldForms: number;
    requiredOpenIssues: number;
    packItems: number;
  };
}
export function buildWorkbook(
  snapshot: EventPacketSnapshot,
  options: { revision?: number; generatedAt?: string } = {},
): Workbook {
  const sources = new Map(
    snapshot.artifacts.map((a, i) => [a.fingerprint, `S${i + 1}`]),
  );
  const ref = (e: EvidenceReference[]) =>
    e.length
      ? Array.from(
          new Set(
            e.map(
              (x) =>
                `${sources.get(x.artifactFingerprint) ?? x.artifactFingerprint.slice(0, 8)}${x.page ? ` p${x.page}` : ""}${x.row ? ` row${x.row}` : ""}${x.cell ? ` cell${x.cell}` : ""}`,
            ),
          ),
        ).join("; ")
      : "No source evidence recorded";
  const value = (v: unknown) =>
    Array.isArray(v) ? v.join("; ") : String(v ?? "");
  const field = (key: string) => {
    const f = snapshot.facts.find((f) => f.fieldKey === key);
    if (f?.status === "confirmed")
      return `${value(f.value)}${f.unit ? ` ${f.unit}` : ""} [${ref(f.evidence)}]`;
    if (f?.status === "not_applicable")
      return `Verified not applicable [${ref(f.evidence)}]`;
    const obs = snapshot.observations.filter((o) => o.fieldKey === key);
    const variants = new Set(
      obs.map((o) => `${JSON.stringify(o.value)}|${o.unit ?? ""}`),
    );
    // Conflicting sources stay explicit review items; a single source value is
    // known data and prints (rule: known data must be pre-filled). Truly
    // unknown fields stay blank for their owner.
    if (f?.status === "conflicted" || variants.size > 1)
      return `NEEDS REVIEW: ${obs.length ? obs.map((o) => `${value(o.value)}${o.unit ? ` ${o.unit}` : ""} [${ref(o.evidence)}]`).join(" | ") : "not verified"}`;
    if (obs.length) {
      const o = obs[0];
      return `${value(o.value)}${o.unit ? ` ${o.unit}` : ""} [${ref(o.evidence)}]`;
    }
    return "";
  };
  const keys = Array.from(
    new Set(
      [...snapshot.facts, ...snapshot.observations].map((f) => f.fieldKey),
    ),
  );
  const names: Record<string, string> = {
    eventTitle: "Event",
    clientName: "Client",
    guestCount: "Guest count",
    serviceStyle: "Service style",
    invoiceNumber: "Invoice",
    eventDate: "Event date",
    "contact.name": "Contact",
    "contact.phone": "Contact phone",
    "contact.email": "Contact email",
    "venue.name": "Venue",
    "venue.address": "Venue address",
    "notes.setup": "Setup notes",
    "notes.access": "Access notes",
  };
  const human = (key: string): string => {
    if (names[key]) return names[key];
    if (key.startsWith("timeline.")) {
      const [, milestone, visit, detail] = key.split(".");
      return `${milestone.replaceAll("_", " ").replace(/^nlt$/, "Departure (NLT)")}${["nlt", "arrive_onsite", "checked_in_with_security"].includes(milestone) ? ` - visit ${visit}` : ""}${detail === "notes" ? " notes" : ""}`;
    }
    if (/^(menu|production|components)\./.test(key)) {
      const parts = key.split(".");
      const root = parts.slice(0, -1).join(".");
      const name =
        snapshot.observations.find((o) => o.fieldKey === root + ".name")
          ?.value ?? parts[1].replaceAll("-", " ");
      return `${name} / ${parts.at(-1)}`;
    }
    return key.replaceAll(".", " / ").replaceAll("_", " ").replaceAll("-", " ");
  };
  const readable = (message: string) =>
    keys
      .slice()
      .sort((a, b) => b.length - a.length)
      .reduce((t, k) => t.replaceAll(k, human(k)), message);
  const urgent = [
    "fact.serviceStyle",
    "check.timeline.load-travel",
    "check.menu.components",
    "check.menu.unit-conversion",
    "check.production.placeholders",
    "check.assignment.vehicle",
    "check.assignment.trailer",
    "check.assignment.crew",
    "check.report.nowsta_event_timesheet",
    "check.report.packlist_item_type",
    "check.report.packlist_category",
    "check.field.buffet-drawing.buffet-applicability",
  ];
  const priority = (i: PacketIssue) =>
    urgent.includes(i.key)
      ? urgent.indexOf(i.key)
      : /conflict/i.test(i.message)
        ? 20
        : 50;
  const open = snapshot.issues
    .filter((i) => i.required && i.status === "open")
    .sort((a, b) => priority(a) - priority(b));
  const evidenceIndex = Array.from(new Set(open.map((i) => ref(i.evidence))));
  const issueText = (i: PacketIssue) =>
    `#${open.indexOf(i) + 1} ${i.severity.toUpperCase()} | ${i.owner.replace("Operations / source owner", "Ops/source owner").replace("Operations reviewer", "Ops reviewer")} | ${readable(i.message)} | E${evidenceIndex.indexOf(ref(i.evidence)) + 1}`;
  const sections: WorkbookSection[] = [];
  const add = (id: string, title: string, blocks: WorkbookBlock[]) => {
    sections.push({ id, title, blocks });
  };
  const text = (text: string, small = false): WorkbookBlock => ({
    kind: "text",
    text,
    small,
  });
  const markers = (
    predicate: (i: PacketIssue) => boolean,
    compact = true,
  ): WorkbookBlock[] => {
    const a = open.filter(predicate);
    return a.length
      ? [
          {
            kind: "issue",
            text: compact
              ? `NEEDS REVIEW - open actions ${a.map((i) => "#" + (open.indexOf(i) + 1)).join(", ")}. Owners, required actions and evidence are on the cover action sheet.`
              : a.map(issueText).join("\n"),
            small: true,
          },
        ]
      : [];
  };
  const status = readiness(snapshot) ? "READY" : "NEEDS ATTENTION";
  const revision = String(options.revision ?? snapshot.revisions.length + 1);
  const generatedAt =
    options.generatedAt ??
    [
      ...snapshot.artifacts.map((a) => a.importedAt),
      ...snapshot.resolutions.map((r) => r.at),
    ]
      .sort()
      .at(-1) ??
    "Time not recorded";
  add("cover", "Event workbook / action sheet", [
    text(
      `${status}\nInvoice ${snapshot.identity.invoiceNumber} | ${snapshot.identity.eventDate}\n${field("eventTitle")}`,
    ),
    text(
      `Revision ${revision} | Inputs current through ${generatedAt}\n${open.length} required open pre-print actions. Known values are printed from native data and imported sources; blanks are unresolved; field forms stay blank for their named owner.`,
    ),
    ...open.map((i) => ({
      kind: "issue" as const,
      text: issueText(i),
      small: true,
    })),
    ...(!open.length && status !== "READY"
      ? [
          text(
            "NEEDS REVIEW: required facts/checks/signatures are incomplete. Reconcile this packet before use.",
          ),
        ]
      : []),
  ]);
  add(
    "brief",
    "Event brief",
    [
      "eventTitle",
      "clientName",
      "guestCount",
      "serviceStyle",
      "venue.name",
      "venue.address",
      "contact.name",
      "contact.phone",
      "contact.email",
      "notes.access",
      "notes.setup",
    ]
      .map((k) => text(`${human(k)}: ${field(k)}`, k.startsWith("notes.")))
      .concat(
        markers((i) => ["serviceStyle", "guestCount"].includes(i.fieldKey)),
      ),
  );
  add("timeline", "Timeline / both visits", [
    ...markers((i) => i.section === "timeline"),
    ...keys
      .filter((k) => k.startsWith("timeline."))
      .sort((a, b) => {
        const time = (k: string) =>
          String(
            snapshot.observations.find(
              (o) => o.fieldKey === k.replace(/\.notes$/, ".time"),
            )?.value ?? "",
          );
        return time(a).localeCompare(time(b)) || a.localeCompare(b);
      })
      .map((k) => text(`${human(k)}: ${field(k)}`, k.startsWith("notes."))),
    text(`Access: ${field("notes.access")}`),
  ]);
  // Stored answers are historical until their current issue and evidence-bound
  // resolution prove that the verification still applies to this snapshot.
  const currentVerifications = snapshot.checklistVerifications.filter(
    (check) => {
      const requirement = requirements.find((r) => r.key === check.checkKey);
      if (
        !requirement ||
        !(
          check.answer === "yes" ||
          (check.answer === "not_applicable" &&
            canMarkNotApplicable(requirement, snapshot))
        )
      )
        return false;
      return snapshot.issues.some(
        (issue) =>
          issue.key === check.checkKey &&
          issue.required &&
          issue.status === "resolved" &&
          snapshot.resolutions.some(
            (resolution) =>
              resolution.issueId === issue.id &&
              resolution.evidenceFingerprint === issue.evidenceFingerprint &&
              resolution.actor === check.actor &&
              resolution.at === check.at &&
              resolution.choice === check.answer &&
              resolution.reason === check.reason,
          ),
      );
    },
  );
  const verificationText = (
    check: EventPacketSnapshot["checklistVerifications"][number],
  ) =>
    `${requirements.find((r) => r.key === check.checkKey)!.message}: ${check.answer} | ${check.actor} | ${check.at} | ${check.reason}`;
  const pages = new Map<
    string,
    { kind: string; page: number; text: string; keys: string[] }
  >();
  for (const s of forms.sections.filter(
    (s) => !s.key.startsWith("training."),
  )) {
    for (const p of s.sourceText) {
      const key = `${s.sourceKind}:${p.page}`;
      const previous = pages.get(key);
      if (previous) previous.keys.push(s.key);
      else
        pages.set(key, {
          kind: s.sourceKind,
          page: p.page,
          text: p.text,
          keys: [s.key],
        });
    }
  }
  // Event Forms One Print pages are embedded verbatim from the supplied
  // original PDF. The workbook overlays event-specific values at their fixed
  // source anchors and adds no generated chrome to these pages.
  const headerOverlays = (): WorkbookOverlay[] => [
    {
      anchor: "Event Number",
      kind: "text",
      value: snapshot.identity.invoiceNumber,
    },
    { anchor: "Event Date", kind: "text", value: snapshot.identity.eventDate },
  ];
  const sourcePageBlock = (
    page: number,
    overlays: WorkbookOverlay[],
  ): WorkbookBlock => ({
    kind: "sourcePage",
    text: "",
    sourcePage: { file: "event-forms-one-print", page, overlays },
  });
  // Safe Y/N derivations for the original Event Task Breakdown page: an
  // answer overlays only when event data or source evidence states it;
  // unresolved questions stay for the human to complete on the form.
  const factValue = (key: string) => {
    const f = snapshot.facts.find((x) => x.fieldKey === key);
    if (f?.status === "confirmed" && f.value !== undefined)
      return value(f.value);
    const o = snapshot.observations.find((x) => x.fieldKey === key);
    return o ? value(o.value) : "";
  };
  const ops = (name: string) => factValue(`ops.${name}`);
  const service = factValue("serviceStyle");
  const serviceNotes = factValue("notes.service");
  const setupNotes = factValue("notes.setup");
  const disposables = ops("mangiaDisposables");
  const rentals = ops("eventRentals");
  const placeSettings = ops("placeSettings");
  const water = `${ops("waterOnsite")} ${ops("tablesideWater")}`;
  const buffetPlates = `${ops("buffetColdPlates")} ${ops("buffetHotPlates")}`;
  const stationaryApps = ops("stationaryApps");
  const cocktailFood = ops("cocktailHourFood");
  const beverages = `${ops("beveragesOnMenu")} ${ops("barService")}`;
  const bussing = ops("bussing");
  const dessert = ops("dessertService");
  const known = (t: string) => t.trim().length > 0;
  const taskOverlays: WorkbookOverlay[] = headerOverlays();
  let servingwareChoice = "";
  if (known(disposables)) {
    if (/client|customer|no mangia/i.test(disposables))
      servingwareChoice = "Client Provided";
    else if (/rent/i.test(disposables)) servingwareChoice = "Rented";
    else if (/mangia|disposable|plastic/i.test(disposables))
      servingwareChoice = "Plasticware";
  }
  if (servingwareChoice)
    taskOverlays.push({
      anchor: "Serving Ware is",
      kind: "choice",
      option: servingwareChoice,
      value: disposables,
    });
  const yn: [string, "yes" | "no"][] = [];
  const say = (key: string, answer: "yes" | "no") => yn.push([key, answer]);
  if (/take|bring|return with|pick ?up/i.test(rentals))
    say("take-rentals-with-us", "yes");
  if (/leave|stay|remain/i.test(rentals)) say("leave-rentals-onsite", "yes");
  if (/(table|chair)/i.test(`${rentals} ${setupNotes}`))
    say("setup-guest-tables-chairs", "yes");
  if (known(placeSettings)) {
    if (/china|flatware|glass/i.test(placeSettings))
      say("set-tables-flatware-china", "yes");
    else if (/disposable/i.test(placeSettings))
      say("set-tables-flatware-china", "no");
  }
  if (known(water)) say("fill-table-water", /no/i.test(water) ? "no" : "yes");
  if (known(buffetPlates) || /full service|buffet/i.test(service))
    say("setup-buffet-tables", "yes");
  else if (/drop ?off|limited/i.test(service)) say("setup-buffet-tables", "no");
  if (known(cocktailFood) || known(stationaryApps))
    say("setup-appetizer-tables", "yes");
  if (known(stationaryApps)) {
    say("stationary-appetizers", "yes");
    say("appetizers-on-own-table", "yes");
  }
  if (/pass/i.test(`${cocktailFood} ${serviceNotes}`))
    say("pass-appetizers", "yes");
  if (known(beverages)) {
    say("setup-beverage-table", "yes");
    say("set-out-beverage-dispensers", "yes");
  }
  if (/full service/i.test(service)) {
    say("serving-buffet", "yes");
    say("self-serve-buffet", "no");
  } else if (/drop ?off|self.?serve|limited/i.test(service)) {
    say("serving-buffet", "no");
    say("self-serve-buffet", "yes");
  }
  if (known(bussing)) {
    if (/client|none|self/i.test(bussing)) say("bus-after-dinner", "no");
    else if (/mangia|staff|full|yes/i.test(bussing))
      say("bus-after-dinner", "yes");
    if (/glass/i.test(bussing) && !/client|none|self/i.test(bussing))
      say("full-bus-all-glassware", "yes");
  }
  if (known(dessert)) say("setup-cake-dessert", "yes");
  if (/cut|slice|serve/i.test(dessert)) say("cut-cake-serve-dessert", "yes");
  if (/coffee/i.test(`${dessert} ${beverages}`))
    say("dessert-coffee-bar", "yes");
  const taskAnchors: Record<string, string> = {
    "take-rentals-with-us": "Take rentals with us",
    "leave-rentals-onsite": "Leave rentals onsite",
    "setup-guest-tables-chairs": "Setup guest tables/chairs",
    "set-tables-flatware-china": "Setting tables with",
    "fill-table-water": "Fill water on tables",
    "setup-buffet-tables": "Setup buffet tables",
    "setup-appetizer-tables": "Setup tables for appetizers",
    "setup-beverage-table": "Setup table for beverages",
    "stationary-appetizers": "Stationary apps",
    "appetizers-on-own-table": "Apps on their own table",
    "appetizers-using-buffet-table": "Apps using main buffet",
    "pass-appetizers": "Pass apps",
    "set-out-beverage-dispensers": "Set out beverage dispensers",
    "serving-buffet": "Serving buffet",
    "self-serve-buffet": "Self serve buffet",
    "bus-after-dinner": "Bus after dinner service",
    "full-bus-all-glassware": "Full bus",
    "setup-cake-dessert": "Setup cake / dessert",
    "cut-cake-serve-dessert": "Cut cake / Serve dessert",
    "dessert-coffee-bar": "Dessert Coffee Bar",
  };
  for (const [key, answer] of yn)
    taskOverlays.push({
      anchor: taskAnchors[key] ?? key,
      kind: "yn",
      answer,
      value: factValue("serviceStyle"),
    });
  for (const p of pages.values()) {
    const fieldForm = p.kind === "event_forms_template";
    const id = fieldForm
      ? p.keys[0]
      : p.kind === "ops_final_lock_template"
        ? "final-lock"
        : `quartermaster.${p.page}`;
    const title = fieldForm
      ? forms.sections.find((s) => s.key === p.keys[0])!.title
      : p.kind === "ops_final_lock_template"
        ? "Ops Final Lock - review draft"
        : `Quartermaster review - ${p.page} / 5`;
    if (fieldForm) {
      // Original page verbatim; header overlay always, pre-filled Y/N on the
      // task breakdown. Field-use pages carry no other generated content.
      add(id, title, [
        id === "field.task"
          ? sourcePageBlock(p.page, taskOverlays)
          : sourcePageBlock(p.page, headerOverlays()),
      ]);
      continue;
    }
    const clean = p.text
      .normalize("NFKC")
      .split("\n")
      .filter((l) => !/^\s*Event (Number|Date)|^\s*EVENT NUMBER/.test(l))
      .map((l) =>
        l
          .replace(/^\s*Y\s*\/\s*N/, "[ ] Yes  [ ] No")
          .replace(/^\s*Y\s+/, "[ ] ")
          .replace(/\(\s*Y\s*\)/g, "( )")
          .replace(/☐/g, "[ ]")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");
    const blocks: WorkbookBlock[] = [
      text(
        `Event ${snapshot.identity.invoiceNumber} | ${snapshot.identity.eventDate} | Checks remain unanswered unless explicitly recorded below.`,
        true,
      ),
      ...markers(
        (i) => p.keys.some((k) => i.key.includes(k) || i.printSection === k),
        true,
      ),
    ];
    if (id === "final-lock" || id === "quartermaster.1")
      blocks.push(
        text(
          "Event context (does not answer verification prompts):\n" +
            ["eventTitle", "guestCount", "serviceStyle", "venue.name"]
              .map((k) => `${human(k)}: ${field(k)}`)
              .join("\n"),
          true,
        ),
      );
    blocks.push({ kind: "form", text: clean });
    const writingSpace: Record<string, string> = {
      "quartermaster.1":
        "Logistics exceptions / access / parking notes:\n________________________________________________________________________\n________________________________________________________________________",
      "quartermaster.2":
        "Vehicle / Trailer / Ops lead / Support staffing assignments:\n________________________________________________________________________\n________________________________________________________________________\n________________________________________________________________________\nEquipment changes / owner / deadline:\n________________________________________________________________________\n________________________________________________________________________",
      "quartermaster.3":
        "Rental vendor / delivery to HQ / date / return details:\n________________________________________________________________________\n________________________________________________________________________\n________________________________________________________________________\nDecor and packlist update notes:\n________________________________________________________________________\n________________________________________________________________________",
      "quartermaster.4":
        "Biggest concern (required): ______________________________________________\n________________________________________________________________________\nAdditional questions or explicit None: ___________________________________\n________________________________________________________________________",
      "quartermaster.5":
        "Initials: ____________________ Date: ____________________",
    };
    if (writingSpace[id]) blocks.push({ kind: "form", text: writingSpace[id] });
    const v = currentVerifications.filter((v) =>
      p.keys.some((k) => v.checkKey.includes(k)),
    );
    if (v.length)
      blocks.push(
        text(
          "Current recorded verifications (printed prompts above stay blank):\n" +
            v.map(verificationText).join("\n"),
          true,
        ),
      );
    add(id, title, blocks);
  }
  const fields = (prefix: string | readonly string[]) =>
    keys
      .filter(
        (k) =>
          (typeof prefix === "string" ? [prefix] : prefix).some((p) =>
            k.startsWith(p),
          ) &&
          !(
            k.endsWith(".name") &&
            keys.includes(k.replace(/\.name$/, ".quantity"))
          ),
      )
      .sort()
      .map((k) => text(`${human(k)}: ${field(k)}`, true));
  add("menu", "Menu and production / original quantities", [
    ...markers((i) => i.section === "menu"),
    ...markers(
      (i) =>
        i.section === "menu" &&
        (!i.key.startsWith("check.") ||
          /check.menu|check.production/.test(i.key)),
      false,
    ),
    ...fields("menu."),
    ...fields("components."),
    ...fields("production."),
  ]);
  // Complete source menu/production details retain instruction continuations and original units.
  const content = keys
    .filter((k) => /^sourceContent\.(event_menu|menu_production)\./.test(k))
    .sort();
  for (const k of content) {
    const obs = snapshot.observations.filter((o) => o.fieldKey === k);
    for (const o of obs)
      add(
        k,
        `Source detail / ${k.replace("sourceContent.", "").replace("event_menu", "Event Menu").replace("menu_production", "Menu production").replace(".page", " / page ")}`,
        [
          text(
            `SOURCE REFERENCE - unverified source wording. Follow reconciled decisions and open actions. ${ref(o.evidence)}`,
            true,
          ),
          text(value(o.value), true),
        ],
      );
  }
  const packIds = Array.from(
    new Set(
      keys
        .filter((k) => k.startsWith("packlist."))
        .map((k) => k.split(".").slice(0, 2).join(".")),
    ),
  );
  for (const [id, title, sort] of [
    ["packlist-item", "Packlist by item type / REFERENCE", "name"],
    ["packlist-category", "Packlist by category / PACKING DRAFT", "category"],
  ] as const) {
    const sourceCategory = (key: string) =>
      String(
        snapshot.observations.find((o) => o.fieldKey === key + ".category")
          ?.value ?? "Unclassified",
      );
    const group = (key: string) =>
      sort === "category"
        ? sourceCategory(key)
        : /food/i.test(sourceCategory(key))
          ? "Food"
          : "Equipment";
    const sorted = [...packIds].sort(
      (a, b) =>
        group(a).localeCompare(group(b)) ||
        field(a + ".name").localeCompare(field(b + ".name")),
    );
    let lastGroup = "";
    const itemBlocks: WorkbookBlock[] = [];
    for (const k of sorted) {
      if (group(k) !== lastGroup) {
        lastGroup = group(k);
        itemBlocks.push({
          kind: "heading",
          text: `Source ${sort === "category" ? "category" : "item type"}: ${lastGroup}`,
          small: true,
        });
      }
      itemBlocks.push(
        text(
          `${field(k + ".name")}\nQuantity: ${field(k + ".quantity")}${keys.includes(k + ".stockCode") ? " | Stock: " + field(k + ".stockCode") : ""}\nCategory: ${field(k + ".category")} | For: ${field(k + ".for")}`,
          true,
        ),
      );
    }
    add(id, title, [
      text(
        sort === "category"
          ? "PACKING COPY - real event rows grouped by warehouse category, for physical checkoff. Quantities keep their original units."
          : "REFERENCE - real event rows by item type with original quantities, units and dish associations. Does not substitute for a missing TPP item-type report.",
      ),
      ...markers((i) => i.section === "packlist"),
      ...itemBlocks,
    ]);
  }
  for (const [id, title, prefix] of [
    [
      "staffing",
      "Staff and event-specific Nowsta roster",
      ["staff", "crew", "assignment.crew"],
    ],
    [
      "vehicles",
      "Vehicle and trailer assignments",
      ["vehicle", "trailer", "assignment.vehicle", "assignment.trailer"],
    ],
    ["equipment", "Rentals and decor / live checks", "equipment"],
    ["venue", "Venue assets and layouts", "venue"],
  ] as const)
    add(id, title, [
      ...markers(
        (i) => i.section === id || (id === "venue" && i.section === "layouts"),
      ),
      ...fields(prefix),
      ...currentVerifications
        .filter((v) =>
          id === "staffing"
            ? v.checkKey === "check.assignment.crew"
            : id === "vehicles"
              ? [
                  "check.assignment.vehicle",
                  "check.assignment.trailer",
                ].includes(v.checkKey)
              : false,
        )
        .map((v) =>
          text(`Current assignment verification: ${verificationText(v)}`, true),
        ),
      text(
        "Owner verification / applicable assets / assignment / evidence: ____________________________________\nVerified by: ____________________ Date: ____________________",
      ),
    ]);
  add("sources", "Source appendix / immutable evidence", [
    ...evidenceIndex.map((e, i) => text(`E${i + 1}: ${e}`, true)),
    ...snapshot.artifacts.map((a, i) =>
      text(
        `S${i + 1} | ${a.name}\nType: ${a.kind} | Parser: ${a.parserVersion}\nSHA-256: ${a.fingerprint}\nImported: ${a.importedAt}${a.sourceTime ? ` | Source time: ${a.sourceTime}` : ""}\nRecognition: ${a.recognitionEvidence.join("; ")}`,
        true,
      ),
    ),
  ]);
  return {
    identity: snapshot.identity,
    revision,
    generatedAt,
    status,
    sections,
    completeness: {
      formPages: pages.size,
      fieldForms: sections.filter((s) => s.id.startsWith("field.")).length,
      requiredOpenIssues: open.length,
      packItems: packIds.length,
    },
  };
}
