/**
 * Cross-checks what the event says guests must not eat against what the
 * catalog says is in each dish (#368 item 14 — a hard "NO ONIONS" event served
 * a Peppercorn Cream Sauce whose description listed shallots, and nothing
 * flagged it). Pure functions: the Menu tab feeds in the event's free-text
 * requirements, guest restrictions, and each dish's text + ingredient names.
 */

export type AvoidTermOrigin =
  | { kind: "service_requirements" }
  | { kind: "operational_requirements" }
  | { kind: "guest"; guestName: string };

export type AvoidTerm = {
  /** The word as the source wrote it ("onions", "shellfish", "gluten"). */
  term: string;
  /** Lower-case family key when the word maps to a known family. */
  family: string | null;
  origin: AvoidTermOrigin;
};

export type DishTextSource = {
  dishId: string;
  lineId: string;
  dishName: string;
  /** Description, recipe text, ingredient names, component names, allergen codes. */
  texts: readonly { label: string; text: string }[];
};

export type DietaryConflict = {
  lineId: string;
  dishId: string;
  dishName: string;
  term: string;
  origin: AvoidTermOrigin;
  /** Where the hit was found and the matching word, e.g. "description: shallots". */
  evidence: string;
};

/**
 * Words that mean "this contains X" for each restriction family. Keys are what
 * a BEO or guest tends to write; values are what a recipe tends to say.
 */
export const RESTRICTION_FAMILIES: Readonly<Record<string, readonly string[]>> =
  {
    onion: [
      "onion",
      "onions",
      "shallot",
      "shallots",
      "scallion",
      "scallions",
      "green onion",
      "green onions",
      "leek",
      "leeks",
      "chive",
      "chives",
      "allium",
    ],
    garlic: ["garlic", "allium"],
    dairy: [
      "dairy",
      "milk",
      "cream",
      "butter",
      "cheese",
      "yogurt",
      "yoghurt",
      "whey",
      "parmesan",
      "mozzarella",
      "cheddar",
      "feta",
      "brie",
      "ricotta",
      "mascarpone",
      "crème fraîche",
      "creme fraiche",
      "half and half",
      "ghee",
    ],
    gluten: [
      "gluten",
      "wheat",
      "flour",
      "bread",
      "breadcrumb",
      "breadcrumbs",
      "panko",
      "pasta",
      "noodle",
      "noodles",
      "couscous",
      "barley",
      "rye",
      "crouton",
      "croutons",
      "soy sauce",
      "pastry",
      "pita",
      "tortilla",
      "roux",
    ],
    nut: [
      "nut",
      "nuts",
      "tree nut",
      "tree nuts",
      "almond",
      "almonds",
      "walnut",
      "walnuts",
      "pecan",
      "pecans",
      "cashew",
      "cashews",
      "pistachio",
      "pistachios",
      "hazelnut",
      "hazelnuts",
      "macadamia",
      "pine nut",
      "pine nuts",
      "marzipan",
      "praline",
    ],
    peanut: ["peanut", "peanuts", "groundnut", "satay"],
    shellfish: [
      "shellfish",
      "shrimp",
      "prawn",
      "prawns",
      "crab",
      "lobster",
      "crawfish",
      "crayfish",
      "scallop",
      "scallops",
      "clam",
      "clams",
      "mussel",
      "mussels",
      "oyster",
      "oysters",
    ],
    fish: [
      "fish",
      "salmon",
      "tuna",
      "cod",
      "halibut",
      "trout",
      "anchovy",
      "anchovies",
      "sardine",
      "sardines",
      "tilapia",
      "mahi",
      "swordfish",
      "fish sauce",
      "worcestershire",
    ],
    egg: ["egg", "eggs", "mayonnaise", "mayo", "aioli", "meringue", "custard"],
    soy: ["soy", "soya", "tofu", "edamame", "tempeh", "miso", "soy sauce"],
    sesame: ["sesame", "tahini", "hummus"],
    pork: [
      "pork",
      "bacon",
      "ham",
      "prosciutto",
      "pancetta",
      "chorizo",
      "salami",
      "sausage",
      "lard",
      "guanciale",
    ],
    beef: ["beef", "steak", "brisket", "veal", "short rib", "tri-tip"],
    alcohol: [
      "alcohol",
      "wine",
      "beer",
      "bourbon",
      "whiskey",
      "rum",
      "vodka",
      "brandy",
      "sherry",
      "marsala",
      "liqueur",
      "tequila",
    ],
    mushroom: ["mushroom", "mushrooms", "truffle", "porcini", "shiitake"],
    cilantro: ["cilantro", "coriander"],
    spicy: [
      "spicy",
      "chili",
      "chile",
      "jalapeño",
      "jalapeno",
      "cayenne",
      "habanero",
    ],
    mustard: ["mustard", "dijon"],
    corn: ["corn", "cornmeal", "polenta", "grits", "cornstarch"],
    citrus: ["citrus", "lemon", "lime", "orange", "grapefruit"],
    tomato: ["tomato", "tomatoes", "marinara", "ketchup"],
    honey: ["honey"],
    coconut: ["coconut"],
    caffeine: ["caffeine", "coffee", "espresso"],
  };

const FAMILY_ALIASES: Readonly<Record<string, string>> = {
  onions: "onion",
  shallots: "onion",
  scallions: "onion",
  leeks: "onion",
  alliums: "onion",
  lactose: "dairy",
  milk: "dairy",
  cheese: "dairy",
  wheat: "gluten",
  celiac: "gluten",
  coeliac: "gluten",
  nuts: "nut",
  "tree nuts": "nut",
  "tree nut": "nut",
  peanuts: "peanut",
  eggs: "egg",
  seafood: "shellfish",
  shrimp: "shellfish",
  crustacean: "shellfish",
  crustaceans: "shellfish",
  mollusc: "shellfish",
  molluscs: "shellfish",
  mushrooms: "mushroom",
  "red meat": "beef",
  "no alcohol": "alcohol",
  booze: "alcohol",
  tomatoes: "tomato",
  spice: "spicy",
  heat: "spicy",
};

/** Lower-case, quotes straightened, sentence punctuation kept as boundaries. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\u00e0-\u00ff\s.,;:!?/&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip the sentence punctuation `normalize` keeps — for lookups, not parsing. */
function plain(text: string): string {
  return normalize(text)
    .replace(/[.,;:!?/&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(word: string): string {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** "onions" → "onion"; "tree nuts" → "nut"; unknown words → null. */
export function restrictionFamily(term: string): string | null {
  const key = plain(term);
  if (!key) return null;
  if (FAMILY_ALIASES[key]) return FAMILY_ALIASES[key]!;
  if (RESTRICTION_FAMILIES[key]) return key;
  const single = singular(key);
  if (RESTRICTION_FAMILIES[single]) return single;
  for (const [family, words] of Object.entries(RESTRICTION_FAMILIES)) {
    if (words.includes(key) || words.includes(single)) return family;
  }
  const stripped = key.replace(/[- ]?free$/, "").replace(/ allergy$/, "");
  if (stripped !== key) return restrictionFamily(stripped);
  return null;
}

// A list of foods: "nuts, peanuts or sesame" — letters plus the connectors,
// ending at sentence punctuation or a word that starts the rest of the sentence.
const FOOD_LIST = "([a-z][a-z' ,/&-]{1,60}?)";
const LIST_END =
  "(?=[.;:!?]|\\s*,?\\s+(?:please|at all|anywhere|whatsoever|for|on|in|of|with|due|because|-)\\b|$)";

const NEGATION_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\bno\\s+${FOOD_LIST}${LIST_END}`, "g"),
  new RegExp(`\\bwithout\\s+${FOOD_LIST}${LIST_END}`, "g"),
  new RegExp(`\\bavoid\\s+${FOOD_LIST}${LIST_END}`, "g"),
  new RegExp(`\\ballergic\\s+to\\s+${FOOD_LIST}${LIST_END}`, "g"),
  new RegExp(
    `\\ballerg(?:y|ies)\\s*(?::|to|-)\\s*${FOOD_LIST}${LIST_END}`,
    "g",
  ),
  new RegExp(
    `\\b(?:zero|none of|omit|exclude|leave out|hold the|absolutely no)\\s+${FOOD_LIST}${LIST_END}`,
    "g",
  ),
  /\b([a-z][a-z' -]{1,30}?)\s+allerg(?:y|ies|ic)\b/g,
  /\b([a-z][a-z' -]{1,30}?)\s+intoleran(?:ce|t)\b/g,
  /\b([a-z]{2,20})[- ]free\b/g,
];

const CONNECTORS = /\s*(?:,|\bor\b|\band\b|\/|&)\s*/;

/**
 * "a peanut" / "is lactose" / "tree nuts" → the food family, trying the whole
 * phrase, then its last two words, then its last word.
 */
function familyForPhrase(
  phrase: string,
): { term: string; family: string } | null {
  const words = plain(phrase).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const candidates = [
    words.join(" "),
    words.slice(-2).join(" "),
    words.slice(-1).join(" "),
  ];
  for (const candidate of candidates) {
    if (candidate.length < 3) continue;
    const family = restrictionFamily(candidate);
    if (family) return { term: candidate, family };
  }
  return null;
}

/** Pull "must not contain" words out of one block of free text. */
export function extractAvoidTermsFromText(
  text: string | null | undefined,
  origin: AvoidTermOrigin,
): AvoidTerm[] {
  if (!text) return [];
  const source = normalize(text);
  const found = new Map<string, AvoidTerm>();
  for (const pattern of NEGATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const phrase = match[1] ?? "";
      for (const piece of phrase.split(CONNECTORS)) {
        const resolved = familyForPhrase(piece);
        // Free-text is noisy ("no problem", "no later than") — only keep
        // words that name a food we know how to look for.
        if (!resolved) continue;
        if (!found.has(resolved.family)) {
          found.set(resolved.family, { ...resolved, origin });
        }
      }
    }
  }
  return [...found.values()];
}

/** Guest-declared restrictions are already single words — take them as given. */
export function avoidTermsFromGuestRestrictions(
  guests: readonly {
    name: string;
    allergenRestrictions?: readonly string[] | null;
    dietaryRestrictions?: readonly string[] | null;
  }[],
): AvoidTerm[] {
  const out: AvoidTerm[] = [];
  for (const guest of guests) {
    for (const raw of [
      ...(guest.allergenRestrictions ?? []),
      ...(guest.dietaryRestrictions ?? []),
    ]) {
      const term = String(raw).replaceAll("_", " ").trim();
      if (!term) continue;
      const family = restrictionFamily(term);
      // Diet labels (vegan, kosher) are not "contains X" checks — skip those
      // that do not name a food family.
      if (!family) continue;
      out.push({
        term,
        family,
        origin: { kind: "guest", guestName: guest.name },
      });
    }
  }
  return out;
}

function wordsFor(term: AvoidTerm): string[] {
  const family = term.family ? RESTRICTION_FAMILIES[term.family] : undefined;
  return [...new Set([plain(term.term), ...(family ?? [])])].filter(Boolean);
}

function findWord(haystack: string, words: readonly string[]): string | null {
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "shallot-free" / "onion free" is the opposite of a hit.
    const pattern = new RegExp(
      `(^|[^a-z])${escaped}(?:s|es)?(?![a-z]|-free\\b|\\s+free\\b)`,
    );
    if (pattern.test(haystack)) return word;
  }
  return null;
}

/** Every (avoid term × dish) pair where the dish's text names that food. */
export function crossCheckMenu(
  avoid: readonly AvoidTerm[],
  dishes: readonly DishTextSource[],
): DietaryConflict[] {
  const conflicts: DietaryConflict[] = [];
  const seen = new Set<string>();
  for (const term of avoid) {
    const words = wordsFor(term);
    for (const dish of dishes) {
      for (const source of dish.texts) {
        const hit = findWord(plain(source.text), words);
        if (!hit) continue;
        const key = `${dish.lineId}|${term.family ?? term.term}|${originKey(term.origin)}`;
        if (seen.has(key)) break;
        seen.add(key);
        conflicts.push({
          lineId: dish.lineId,
          dishId: dish.dishId,
          dishName: dish.dishName,
          term: term.term,
          origin: term.origin,
          evidence: `${source.label}: “${hit}”`,
        });
        break;
      }
    }
  }
  return conflicts.sort(
    (a, b) =>
      a.dishName.localeCompare(b.dishName) || a.term.localeCompare(b.term),
  );
}

function originKey(origin: AvoidTermOrigin): string {
  return origin.kind === "guest" ? `guest:${origin.guestName}` : origin.kind;
}

export function describeOrigin(origin: AvoidTermOrigin): string {
  switch (origin.kind) {
    case "service_requirements":
      return "Service requirements";
    case "operational_requirements":
      return "Operational requirements";
    case "guest":
      return `Guest: ${origin.guestName}`;
  }
}
