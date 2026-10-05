import { parsePackSources, type PackSource } from "../../lib/packRules";

/** The pack line fields that explain where a line came from (spec §13.2:
 * "why are 18 of these on the truck?"). */
export type PackLineFacts = {
  requiredQuantity: number;
  unit: string;
  generatedQuantity?: number | null;
  followsDishServings?: boolean | null;
  sourcesJson?: string | null;
  generationKey?: string | null;
  category?: string | null;
  ownership?: string | null;
  returnRequired?: boolean | null;
  returnNote?: string | null;
  requiredCapability?: boolean | null;
  excludedAt?: number | null;
  exclusionReason?: string | null;
  replacementDescription?: string | null;
  coveredBy?: string | null;
  serviceStyleKitItemId?: string | null;
  dishContainerId?: string | null;
  containerServings?: number | null;
  packListTemplateId?: string | null;
  templateVersion?: number | null;
  retiredAt?: number | null;
};

export type PackLineExplanation = {
  origin: string;
  reasons: string[];
  details: string[];
  leftOff: string | null;
};

const CATEGORY_WORDS: Record<string, string> = {
  serving_vessel: "Serving piece",
  utensil: "Utensil",
  holding: "Hot or cold holding",
  transport: "Transport",
  garnish: "Garnish tools",
  portioning: "Portioning",
  disposable: "Disposables",
  place_setting: "Place settings",
  linen: "Linen",
  table_setup: "Tables and setup",
  power: "Power",
  water: "Water",
  handwashing: "Handwashing",
  tent: "Tent",
  flooring: "Flooring",
  weather: "Weather",
  bar: "Bar",
  glassware: "Glassware",
  ice: "Ice",
  decor: "Decor",
  rental: "Rental",
  other: "Other",
};

const OWNER_WORDS: Record<string, string> = {
  owned: "Ours",
  rented: "Rented",
  client: "The client's",
};

const COVER_WORDS: Record<string, string> = {
  equivalent: "something else does the job",
  client: "the client brings it",
  vendor: "a vendor brings it",
};

export function packCategoryLabel(category: string): string {
  return CATEGORY_WORDS[category] ?? category;
}

function sourceLine(source: PackSource): string {
  const version =
    source.ruleVersion != null ? ` (rule version ${source.ruleVersion})` : "";
  return `${source.sourceLabel}: ${source.formula}${version}`;
}

function origin(line: PackLineFacts): string {
  if (line.generationKey) return "From the pack rules";
  if (line.serviceStyleKitItemId) return "From the service style kit";
  if (line.dishContainerId) return "From the dish's container";
  if (line.packListTemplateId)
    return line.templateVersion != null
      ? `From a template (version ${line.templateVersion})`
      : "From a template";
  return "Added by hand";
}

/** Plain-words answer to "why this many, and whose is it?". */
export function explainPackLine(line: PackLineFacts): PackLineExplanation {
  const reasons = parsePackSources(line.sourcesJson).map(sourceLine);
  if (
    reasons.length === 0 &&
    line.dishContainerId &&
    line.containerServings != null
  )
    reasons.push(`${line.containerServings} servings on the menu`);
  const details: string[] = [];
  if (line.category) details.push(packCategoryLabel(line.category));
  if (line.ownership)
    details.push(OWNER_WORDS[line.ownership] ?? line.ownership);
  if (line.returnRequired === true)
    details.push(line.returnNote?.trim() || "Comes back after the event");
  if (line.returnRequired === false) details.push("Does not come back");
  if (line.requiredCapability) details.push("Must-have");
  if (
    line.followsDishServings === false &&
    line.generatedQuantity != null &&
    Number(line.generatedQuantity) !== Number(line.requiredQuantity)
  )
    details.push(
      `Amount set by hand. The rules say ${line.generatedQuantity} ${line.unit}.`,
    );
  else if (line.followsDishServings === false)
    details.push("Amount set by hand");
  if (line.retiredAt != null) details.push("Nothing asks for this any more");
  let leftOff: string | null = null;
  if (line.excludedAt != null) {
    const parts = [`Left off: ${line.exclusionReason ?? "no reason given"}`];
    if (line.replacementDescription)
      parts.push(`Stand-in: ${line.replacementDescription}`);
    if (line.coveredBy)
      parts.push(
        `Covered because ${COVER_WORDS[line.coveredBy] ?? line.coveredBy}`,
      );
    leftOff = parts.join(". ");
  }
  return { origin: origin(line), reasons, details, leftOff };
}
