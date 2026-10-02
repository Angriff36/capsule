/**
 * Builds docs/systems/ui-contract.md: for each of the ten screen areas in the
 * backend end-state spec (BE-18.6), every read and every action the screens
 * call today, with the facts the generated wiring bindings already hold
 * (inputs, version, retry key, result, refusals, effects, refresh).
 *
 *   bun scripts/ui-contract.ts          write the document
 *   bun scripts/ui-contract.ts --check  fail when the document is out of date
 *
 * tests/backend-ui-contract.test.ts runs the same build inside `bun run test`
 * and fails when a screen calls a function that no longer exists.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as bindings from "../src/generated/manifest-wiring-bindings";

const ROOT = join(import.meta.dirname, "..");
export const UI_CONTRACT_DOC = "docs/systems/ui-contract.md";

export interface UiArea {
  id: string;
  title: string;
  /** Paths under src/features, matched from the start. */
  paths: RegExp[];
}

const F = (pattern: string) => new RegExp(`^src/features/${pattern}`);

export const UI_AREAS: UiArea[] = [
  {
    id: "lead-client",
    title: "Lead and client",
    paths: [
      F("clients/(Client|Lead|Contract|CrmFailure|contactDedup)"),
      F("sales/(MessageInbox|PasteIncoming|QuoteSubmission|SyncErrors)"),
    ],
  },
  {
    id: "proposal",
    title: "Proposal",
    paths: [
      F(
        "clients/(Proposal|EventProposal|SharedProposal|proposal|useSendProposal|useStartProposal|useCreateEventFromProposal|useCatalogDishes)",
      ),
      F(
        "sales/(ProposalSignature|Quote(Estimate|MenuChoice|RequestPicks)|PublicMenu)",
      ),
    ],
  },
  {
    id: "event-overview",
    title: "Event overview",
    paths: [
      F(
        "events/(EventDetail|EventOverview|EventDetailsCard|EventStageActions|EventReadiness|EventsListPage|EventCreate|EventSetup|EventFormCluster|EventHistoryTab|EventClient|EventRequirements|EventArchive|EventDuplicate|EventIncident|EventGuest|EventServiceStyle|EventSourceProvenance|CompleteDraftPlanning|EventTodos|EventChecklists|EventTrackerPage|EventWeather|tracker/|dashboard/|planning/)",
      ),
    ],
  },
  {
    id: "menu-kitchen",
    title: "Menu and kitchen",
    paths: [
      F(
        "events/(EventMenu|EventPrep|ComponentStock|EventAllergen|AllergenBriefing|CateringPackagePicker|EventDraftPo|EventStock|EventUnresolvedMaterials|useEventMenuNutrition)",
      ),
      F("kitchen/"),
      F("production/"),
    ],
  },
  {
    id: "timeline",
    title: "Timeline and route",
    paths: [
      F(
        "events/(EventTimeline|EventTiming|EventDriveTime|EventRouteLegs|EventRouteMap|EventDaySheet|EventShiftChanges|EventMapPanel|EventRunStops|TimelineBlockPicker)",
      ),
    ],
  },
  {
    id: "staffing-my-day",
    title: "Staffing and My Day",
    paths: [F("events/(EventStaff|StaffNeed)"), F("workforce/"), F("staff/")],
  },
  {
    id: "pack-warehouse",
    title: "Pack list and warehouse",
    paths: [
      F(
        "logistics/(Pack|ServiceStyleKit|usePackRigs|Dispatch|Deliveries|TripCheck|EventTripChecks|LogisticsOverview|RoutePlanner|Vehicle)",
      ),
    ],
  },
  {
    id: "rentals-decor",
    title: "Rentals and decor",
    paths: [
      F(
        "events/(EventEquipment|EventRentalOrders|EventLayout|EventBattleBoard)",
      ),
      F("facilities/Equipment"),
      F("logistics/ReturnsPage"),
    ],
  },
  {
    id: "final-lock-packet",
    title: "Final Lock and event packet",
    paths: [F("events/packet/"), F("events/review-flags/")],
  },
  {
    id: "billing-closeout",
    title: "Billing and closeout",
    paths: [
      F("finance/"),
      F(
        "events/(EventInvoiceCard|EventClientBillingPanel|EventMargin|EventBudgetCard|LiveEventProfitability)",
      ),
    ],
  },
];

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) =>
      entry.isDirectory()
        ? walk(`${dir}/${entry.name}`)
        : [`${dir}/${entry.name}`],
  );
}

function screenFiles(): string[] {
  return walk("src/features").filter(
    (file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file),
  );
}

/** Generated hook name -> generated function ("mutations.X" / "queries.y"). */
function generatedHooks(): Map<string, string> {
  const source = readFileSync(
    join(ROOT, "src/lib/manifest-convex-react.ts"),
    "utf8",
  );
  const hooks = new Map<string, string>();
  const pattern =
    /export function (use\w+)\([^)]*\)[^{]*\{\s*(?:const mutate = useMutation|return useQuery)\(api\.(mutations|queries)\.(\w+)/g;
  for (const match of source.matchAll(pattern)) {
    hooks.set(match[1]!, `${match[2]}.${match[3]}`);
  }
  return hooks;
}

const convexSources = new Map<string, string | null>();

function convexSource(module: string): string | null {
  if (!convexSources.has(module)) {
    const file = join(ROOT, "convex", `${module}.ts`);
    convexSources.set(
      module,
      existsSync(file) ? readFileSync(file, "utf8") : null,
    );
  }
  return convexSources.get(module) ?? null;
}

export type FunctionKind = "query" | "mutation" | "action" | "missing";

/** The kind of a public Convex function, or "missing" when it is not exported. */
export function functionKind(ref: string): FunctionKind {
  const dot = ref.lastIndexOf(".");
  const module = ref.slice(0, dot).replace(/\./g, "/");
  const name = ref.slice(dot + 1);
  const source = convexSource(module);
  if (source == null) return "missing";
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*(\\w+)`));
  if (!match) return "missing";
  const builder = match[1]!;
  if (/action/i.test(builder)) return "action";
  if (/mutation/i.test(builder)) return "mutation";
  return "query";
}

interface Capability {
  capabilityId: string;
  versionField: string | null;
  acceptsIdempotencyKey: boolean;
  resultKind: string;
  returnTsType: string;
  clientParameterNames: readonly string[];
  serverParameterNames: readonly string[];
  failures: readonly { kind: string; message: string }[];
  emits: readonly string[];
}

const BINDINGS = bindings as unknown as Record<string, unknown>;

/** Wiring facts for a generated mutation such as "Event_changeHeadcount". */
export function capabilityFor(mutation: string): {
  capability: Capability;
  refresh: string[];
} | null {
  const [entity, rawCommand] = mutation.split("_") as [string, string?];
  if (!rawCommand) return null;
  const command = rawCommand.startsWith("createVia")
    ? rawCommand.slice("createVia".length)
    : rawCommand;
  const key = `${entity}${command[0]!.toUpperCase()}${command.slice(1)}`;
  const capability = BINDINGS[`${key}Capability`] as Capability | undefined;
  if (!capability) return null;
  const invalidation =
    (BINDINGS[`${key}Invalidation`] as readonly { readId: string }[]) ?? [];
  return {
    capability,
    refresh: [...new Set(invalidation.map((i) => i.readId))],
  };
}

const GENERATED_CLIENT = /^src\/(lib\/(manifest-convex-react|api)|generated\/)/;

/**
 * The area's screens plus the plain .ts helper modules they import (hooks,
 * coordinators), followed through further .ts imports. Components (.tsx) of
 * other areas are not pulled in.
 */
function withHelperModules(files: string[]): string[] {
  const seen = new Set(files);
  const queue = [...files];
  while (queue.length > 0) {
    const file = queue.pop()!;
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const match of source.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
      const base = join(file, "..", match[1]!).replace(/\\/g, "/");
      const target = `${base}.ts`;
      if (
        !/^src\//.test(target) ||
        GENERATED_CLIENT.test(target) ||
        seen.has(target) ||
        !existsSync(join(ROOT, target))
      )
        continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return [...seen];
}

export interface AreaContract {
  area: UiArea;
  files: string[];
  reads: string[];
  commands: string[];
  authoredCalls: string[];
  missing: string[];
}

export function buildAreaContracts(): AreaContract[] {
  const hooks = generatedHooks();
  const files = screenFiles();
  return UI_AREAS.map((area) => {
    const own = files.filter((file) => area.paths.some((p) => p.test(file)));
    const reads = new Set<string>();
    const commands = new Set<string>();
    const authored = new Set<string>();
    const missing = new Set<string>();
    for (const file of withHelperModules(own)) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const match of source.matchAll(/\b(use[A-Z]\w+)\b/g)) {
        const ref = hooks.get(match[1]!);
        if (!ref) continue;
        (ref.startsWith("mutations.") ? commands : reads).add(ref);
      }
      for (const match of source.matchAll(
        /(?<![\w/.])api\.([A-Za-z]\w*(?:\.[A-Za-z]\w*)+)/g,
      )) {
        let ref = match[1]!;
        if (convexSource(ref.replace(/\./g, "/")) != null) {
          // `const commands = api.lib.eventPacket.commands;` then `commands.x`
          const alias = source.match(
            new RegExp(`const (\\w+) = api\\.${ref.replace(/\./g, "\\.")};`),
          )?.[1];
          if (!alias) continue;
          for (const use of source.matchAll(
            new RegExp(`\\b${alias}\\.(\\w+)`, "g"),
          )) {
            authored.add(`${ref}.${use[1]}`);
          }
          continue;
        }
        if (ref.startsWith("mutations.")) commands.add(ref);
        else if (ref.startsWith("queries.")) reads.add(ref);
        else authored.add(ref);
      }
    }
    for (const ref of [...reads, ...commands, ...authored]) {
      if (functionKind(ref) === "missing") missing.add(ref);
    }
    for (const ref of commands) {
      if (!capabilityFor(ref.slice("mutations.".length))) missing.add(ref);
    }
    return {
      area,
      files: own.map((file) =>
        relative(ROOT, join(ROOT, file)).replace(/\\/g, "/"),
      ),
      reads: [...reads].sort(),
      commands: [...commands].sort(),
      authoredCalls: [...authored].sort(),
      missing: [...missing].sort(),
    };
  });
}

function list(items: readonly string[], max = 6): string {
  if (items.length === 0) return "none";
  const shown = items.slice(0, max).map((item) => `"${item}"`);
  return items.length > max
    ? `${shown.join("; ")}; and ${items.length - max} more`
    : shown.join("; ");
}

function commandLine(ref: string): string {
  const facts = capabilityFor(ref.slice("mutations.".length));
  if (!facts) return `- \`${ref}\` - NO WIRING BINDING`;
  const { capability: c, refresh } = facts;
  const refusals = [...new Set(c.failures.map((f) => f.message))];
  return [
    `- \`${ref}\` (${c.capabilityId})`,
    `  - inputs from the screen: ${c.clientParameterNames.join(", ") || "none"}; filled by the server: ${c.serverParameterNames.join(", ") || "none"}`,
    `  - version: ${c.versionField ? `required (\`${c.versionField}\`)` : "not used"}; retry key: ${c.acceptsIdempotencyKey ? "accepted (same key = same result)" : "not accepted"}`,
    `  - result: ${c.resultKind} \`${c.returnTsType.length > 80 ? `${c.returnTsType.slice(0, 77)}...` : c.returnTsType}\``,
    `  - refusals (role, stage and rules): ${list(refusals)}`,
    `  - effects: ${c.emits.join(", ") || "none"}`,
    `  - refresh: live reads update by themselves; reads affected: ${refresh.length > 8 ? `${refresh.slice(0, 8).join(", ")} and ${refresh.length - 8} more` : refresh.join(", ") || "none"}`,
  ].join("\n");
}

function authoredLine(ref: string): string {
  const kind = functionKind(ref);
  const refresh =
    kind === "query"
      ? "live read, updates by itself"
      : kind === "action"
        ? "one-time call (not live); the live reads it changes update by themselves"
        : kind === "mutation"
          ? "authored step; live reads update by themselves"
          : "MISSING";
  return `- \`${ref}\` - ${kind}; ${refresh}`;
}

export function renderUiContract(contracts = buildAreaContracts()): string {
  const out = [
    "# Screen read and action contract",
    "",
    "Built by `bun scripts/ui-contract.ts` from the screens under `src/features`, the generated",
    "hooks (`src/lib/manifest-convex-react.ts`) and the generated wiring bindings",
    "(`src/generated/manifest-wiring-bindings.ts`). Do not edit by hand; rebuild it.",
    "`tests/backend-ui-contract.test.ts` fails when this file is out of date or a screen calls a",
    "function that does not exist.",
    "",
    "Shared rules for every area:",
    "",
    "- Every read is a Convex live query, filtered to the signed-in company and to records that are",
    "  not removed. A screen never needs a full page reload after an action.",
    "- Every action is a generated Manifest command or a named authored step. Failures carry one",
    "  stable code from `classifyCommandFailure` (`src/features/events/CommandFailure.ts`):",
    "  NOT_FOUND_OR_FORBIDDEN, STALE_VERSION, INVALID_STATE, VALIDATION_FAILED, MISSING_REQUIRED_FACT,",
    "  UNIT_CONVERSION_UNRESOLVED, INSUFFICIENT_STOCK, SCHEDULE_CONFLICT, PROVIDER_RETRYING,",
    "  PROVIDER_ACTION_REQUIRED, RECONCILIATION_REQUIRED, UNEXPECTED.",
    "- The generated result envelope is kept as is.",
    "",
  ];
  contracts.forEach((contract, index) => {
    out.push(`## ${index + 1}. ${contract.area.title}`, "");
    out.push(
      `Screens (${contract.files.length}): ${contract.files.map((f) => `\`${f.replace("src/features/", "")}\``).join(", ")}`,
      "",
    );
    out.push("### Generated reads", "");
    out.push(
      ...(contract.reads.length
        ? contract.reads.map((r) => `- \`${r}\` - live read`)
        : ["- none"]),
      "",
    );
    out.push("### Generated actions", "");
    out.push(
      ...(contract.commands.length
        ? contract.commands.map(commandLine)
        : ["- none"]),
      "",
    );
    out.push("### Authored reads and steps", "");
    out.push(
      ...(contract.authoredCalls.length
        ? contract.authoredCalls.map(authoredLine)
        : ["- none"]),
      "",
    );
  });
  return `${out.join("\n").trimEnd()}\n`;
}

if (import.meta.main) {
  const doc = renderUiContract();
  const target = join(ROOT, UI_CONTRACT_DOC);
  if (process.argv.includes("--check")) {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (current.replace(/\r\n/g, "\n") !== doc) {
      console.error(
        `${UI_CONTRACT_DOC} is out of date. Run: bun scripts/ui-contract.ts`,
      );
      process.exit(1);
    }
    console.log(`${UI_CONTRACT_DOC} is current.`);
  } else {
    writeFileSync(target, doc);
    console.log(`Wrote ${UI_CONTRACT_DOC}.`);
  }
}
