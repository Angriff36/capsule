import {
  answered,
  dishSources,
  equipmentSources,
  notApplicable,
  proposalSources,
  said,
  source,
  unresolved,
  type Draft,
} from "./answer";
import { isDropOff } from "./policy";
import type { FinalLockInput } from "./types";

const DESSERT = /dessert|cake|cupcake|\bpie\b|cookie|brownie|tart|sweet/i;
const COFFEE = /coffee|espresso/i;
const COFFEE_GEAR = /coffee|urn|airpot|carafe|espresso/i;

type Kind = "vegetable" | "starch" | "protein" | "salad" | "bread" | "cold";
const KINDS: [Kind, RegExp][] = [
  ["salad", /salad/i],
  ["bread", /bread|roll|butter|focaccia|biscuit/i],
  [
    "vegetable",
    /vegetable|\bveg|green|broccoli|bean|carrot|asparagus|squash|brussels|zucchini|corn|spinach/i,
  ],
  [
    "starch",
    /potato|rice|pasta|starch|grain|risotto|noodle|polenta|\bmac\b|gnocchi|couscous|quinoa/i,
  ],
  [
    "protein",
    /chicken|beef|pork|fish|salmon|protein|meat|turkey|lamb|shrimp|tofu|brisket|steak|sausage|meatball|entree|entrée/i,
  ],
  ["cold", /cold|slaw|fruit|crudit|antipast|charcuter|cheese/i],
];
const HOT_RANK: Partial<Record<Kind, number>> = {
  vegetable: 0,
  starch: 1,
  protein: 2,
};

/** Dessert and coffee, beverage/bar, and the buffet arrangement standard. */
export function dessertBarBuffetAnswers(
  input: FinalLockInput,
): Record<string, Draft> {
  const { event, dishes } = input;
  const text = event.text;
  const ev = (field: string) => source("events", event, field);
  const dropOff = isDropOff(input.serviceStyle?.name ?? null);
  const out: Record<string, Draft> = {};

  const desserts = dishes.filter((d) =>
    DESSERT.test(`${d.course ?? ""} ${d.name}`),
  );
  // Accepted proposal scope, staff asked for and coffee equipment.
  const scope = (input.proposal?.lines ?? []).filter(
    (l) =>
      DESSERT.test(l.text) || COFFEE.test(l.text) || /cutting/i.test(l.text),
  );
  const cuttingSold = scope.some((l) => /cutting/i.test(l.text));
  const coffeeGear = [
    ...input.equipment
      .filter((e) => COFFEE_GEAR.test(`${e.name} ${e.category ?? ""}`))
      .flatMap(equipmentSources),
    ...input.kitItems
      .filter((i) => COFFEE_GEAR.test(i.description))
      .flatMap((i) => source("serviceStyleKitItems", i)),
    ...input.packItems
      .filter((i) => COFFEE_GEAR.test(i.description))
      .flatMap((i) => source("packListItems", i)),
  ];
  const cake = desserts.some((d) => /cake/i.test(d.name)) || cuttingSold;
  const coffeeDishes = dishes.filter((d) => COFFEE.test(d.name));
  const coffee =
    coffeeDishes.length > 0 || COFFEE.test(text.beveragesOnMenu ?? "");
  const dessert = said(text.dessertService);
  const dessertSources = [
    ...ev("dessertService"),
    ...ev("beveragesOnMenu"),
    ...[...desserts, ...coffeeDishes].flatMap((d) => dishSources(d)),
    ...scope.flatMap((l) => proposalSources(input.proposal, l)),
    ...input.staffNeeds.flatMap((n) => source("eventStaffNeeds", n)),
    ...input.assignments.flatMap((a) => source("eventAssignments", a)),
    ...coffeeGear,
  ];
  const who =
    dessert.kind === "party"
      ? dessert.party
      : dessert.kind === "yes"
        ? "Mangia"
        : null;
  // Cake cutting is sold for a cake the client brings, so it needs no dish.
  const onMenu = (l: { text: string }) =>
    /cutting/i.test(l.text) ||
    (COFFEE.test(l.text) ? coffee : desserts.length > 0);
  const clash = [
    ...scope
      .filter((l) => !onMenu(l))
      .map(
        (l) => `Accepted proposal line "${l.text}" is not on the event menu.`,
      ),
    ...(cuttingSold && who !== "Mangia"
      ? [
          `The accepted proposal sells cake cutting, but dessert service says ${dessert.kind === "empty" ? "nothing" : `"${text.dessertService?.trim()}"`}.`,
        ]
      : []),
    ...(who === "Mangia" &&
    !dropOff &&
    (desserts.length || coffee || cuttingSold) &&
    !input.staffNeeds.length &&
    !input.assignments.length
      ? [
          "Mangia serves dessert, but no staff are asked for or assigned on this event.",
        ]
      : []),
    ...(who === "Mangia" && coffee && !coffeeGear.length
      ? [
          "Mangia runs the coffee bar, but no coffee urn or airpot is reserved or packed.",
        ]
      : []),
  ];
  if (!desserts.length && !coffee && !cuttingSold)
    out["dessert.plan"] =
      (who && who === "Mangia") || clash.length
        ? unresolved(
            who === "Mangia"
              ? [
                  "Dessert service is set, but no dessert or coffee is on the menu.",
                  ...clash,
                ]
              : clash,
            "Add the dessert to the menu or clear dessert service.",
            "dessert.plan.menu-and-service",
            dessertSources,
          )
        : notApplicable(
            "No dessert or coffee is on the menu.",
            "dessert.plan.none-on-menu",
            dessertSources,
          );
  else if (dropOff && who === "Mangia")
    out["dessert.plan"] = unresolved(
      [
        "Dessert service says Mangia, but a drop-off has no staff to cut and serve.",
      ],
      "Change dessert service or the service style.",
      "dessert.plan.staff-needed",
      [...dessertSources, ...source("serviceStyles", input.serviceStyle)],
    );
  else if (clash.length)
    out["dessert.plan"] = unresolved(
      clash,
      "Make the dessert service, menu, staff and equipment agree with the accepted proposal.",
      "dessert.plan.menu-and-service",
      dessertSources,
    );
  else if (dessert.kind === "no")
    out["dessert.plan"] = answered(
      {
        type: "record",
        fields: { setup: null, cutting: null, serving: null, coffeeBar: null },
      },
      "Mangia does not set up, cut or serve dessert: the day sheet says no.",
      "dessert.plan.menu-and-service",
      dessertSources,
    );
  else if (who)
    out["dessert.plan"] = answered(
      {
        type: "record",
        fields: {
          setup: who,
          cutting: cake ? who : null,
          serving: who,
          coffeeBar: coffee ? who : null,
        },
      },
      `${who} sets up${cake ? ", cuts the cake" : ""} and serves dessert${coffee ? ", and runs the coffee bar" : ""}.`,
      "dessert.plan.menu-and-service",
      dessertSources,
    );
  else
    out["dessert.plan"] = unresolved(
      [
        dessert.kind === "other"
          ? `"${dessert.text}" does not say who sets up and serves dessert.`
          : "Dessert or coffee is on the menu but nobody is named to set it up and serve it.",
      ],
      "Fill in dessert service on the day sheet.",
      "dessert.plan.menu-and-service",
      dessertSources,
    );

  // Beverage and bar: always answered or proven not needed, never blank.
  const bar = said(text.barService);
  const drinks = text.beveragesOnMenu?.trim() ?? "";
  const barSources = [...ev("barService"), ...ev("beveragesOnMenu")];
  if (bar.kind === "empty" || bar.kind === "other")
    out["beverage.bar"] = unresolved(
      [
        bar.kind === "other"
          ? `"${bar.text}" does not say who runs the bar.`
          : "The bar and drinks section is blank.",
      ],
      "Fill in bar service and drinks on the day sheet.",
      "beverage.bar.never-blank",
      barSources,
    );
  else if (bar.kind === "no" && (!drinks || said(drinks).kind === "no"))
    out["beverage.bar"] = notApplicable(
      "No bar and no drinks: the day sheet says so.",
      "beverage.bar.none-on-event",
      barSources,
    );
  else {
    const runner =
      bar.kind === "no" ? null : bar.kind === "party" ? bar.party : "Mangia";
    const needs = [
      ...(runner === "Mangia" ? ["bar staff", "bar pack items"] : []),
      ...(drinks && said(drinks).kind !== "no" ? [`drinks: ${drinks}`] : []),
      ...(runner === "Mangia" || (drinks && said(drinks).kind !== "no")
        ? ["drinks table"]
        : []),
    ];
    out["beverage.bar"] = answered(
      {
        type: "record",
        fields: { applicable: true, bar: runner, drinks: drinks || null },
      },
      runner
        ? `${runner} runs the bar${needs.length ? `; needs ${needs.join(", ")}` : ""}.`
        : `No bar; needs ${needs.join(", ")}.`,
      "beverage.bar.from-day-sheet",
      barSources,
    );
  }

  // Buffet arrangement standard.
  const split = (s: string | null) =>
    (s ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  const hot = split(text.buffetHotPlates);
  const cold = split(text.buffetColdPlates);
  const buffetSources = [...ev("buffetHotPlates"), ...ev("buffetColdPlates")];
  const kindOf = (plate: string): Kind | null => {
    const dish = dishes.find(
      (d) => d.name.trim().toLowerCase() === plate.toLowerCase(),
    );
    const words = `${dish?.course ?? ""} ${plate}`;
    return KINDS.find(([, re]) => re.test(words))?.[0] ?? null;
  };
  if (!hot.length && !cold.length) {
    out["buffet.arrangement"] =
      dropOff || said(text.buffetTableSetup).kind === "no"
        ? notApplicable(
            dropOff
              ? "Drop-off: no buffet line is set by staff."
              : "The task breakdown says there is no buffet.",
            dropOff
              ? "buffet.arrangement.drop-off"
              : "buffet.arrangement.no-buffet",
            [
              ...ev("buffetTableSetup"),
              ...source("serviceStyles", input.serviceStyle),
            ],
          )
        : unresolved(
            ["No buffet plate order is recorded."],
            "Fill in the hot and cold buffet plates on the day sheet.",
            "buffet.arrangement.mangia-standard",
            buffetSources,
          );
    return out;
  }
  const issues: string[] = [];
  const unknown = hot.filter((p) => kindOf(p) === null);
  for (const plate of unknown)
    issues.push(
      `Can't tell if ${plate} is a vegetable, starch or protein: set its course on the menu.`,
    );
  const ranked = hot
    .map((p) => [p, HOT_RANK[kindOf(p) as Kind]] as const)
    .filter((r): r is readonly [string, number] => r[1] != null);
  ranked.slice(1).forEach(([plate, rank], i) => {
    if (rank < ranked[i]![1])
      issues.push(
        `${plate} comes after ${ranked[i]![0]}: vegetables go closest to the plates, then starches, then proteins.`,
      );
  });
  if (hot.length > 3)
    issues.push(
      `${hot.length} hot items: the standard is three per line; plan a second table or rotate chafers.`,
    );
  const saladAt = cold.findIndex((p) => kindOf(p) === "salad");
  cold.forEach((plate, i) => {
    const kind = kindOf(plate);
    if (saladAt >= 0 && i > saladAt && kind !== "salad" && kind !== "bread")
      issues.push(
        `${plate} comes after the salad: cold sides go before the salad.`,
      );
  });
  if (saladAt < 0)
    issues.push("No salad on the buffet: the standard buffet has one.");
  if (!cold.some((p) => kindOf(p) === "bread"))
    issues.push(
      "No bread and butter on the buffet: the standard buffet has them.",
    );
  out["buffet.arrangement"] = issues.length
    ? unresolved(
        issues,
        "Reorder the buffet on the day sheet, or record why this event is different.",
        "buffet.arrangement.mangia-standard",
        buffetSources,
      )
    : answered(
        {
          type: "record",
          fields: { hot: hot.join(", "), cold: cold.join(", ") },
        },
        "The buffet follows the Mangia standard order.",
        "buffet.arrangement.mangia-standard",
        buffetSources,
      );
  return out;
}
