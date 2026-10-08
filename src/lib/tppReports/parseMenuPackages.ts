// AC-057 packages: TPP's "Menu Item Packages" report -> the old system's
// catering packages, each with its choice groups and dishes. Built against
// the real report (.artifacts/tpp-migration-20260905/tpp_migration/reports/
// company_wide/Menu_Item_Packages.xlsx: 74 packages, 237 groups, 730 dish
// lines on 46 pages). Everything is in column A; only the font tells the
// lines apart:
//   bold with a rule line under it  -> a package ("Steak Dinner")
//   bold blue                       -> a choice group ("Choice of 1 Salad")
//   bold italic                     -> a dish ("Mixed Green Salad with Ranch Dressing")
//   plain                           -> the description of the line above
// plus a "Printed Date:" line per page. The report was printed with
// "Show Prices?" off, so it holds no package or seasonal prices.

import {
  readXlsxCellLooksFromEntries,
  type XlsxCellLook,
} from "./xlsxCellLooks";
import { XlsxReportGrid } from "./xlsxReportGrid";
import {
  readXlsxWorkbookFromEntries,
  type ZipEntryMap,
} from "./xlsxWorkbookParser";

/** Where every part of the report goes. */
export const TPP_MENU_PACKAGE_PARTS: ReadonlyArray<{
  part: string;
  goesTo: string;
}> = [
  {
    part: "Package name",
    goesTo: 'a draft menu "Old system package - <name>"',
  },
  { part: "Package description", goesTo: "the menu's description" },
  {
    part: "Choice group",
    goesTo:
      'the course of each dish under it; "select 1" / "choice of 1" groups become the menu\'s pick-one courses',
  },
  {
    part: "Choice group note",
    goesTo:
      'the menu\'s description as "<group>: <note>" (also a group with no dishes, such as "No modifications available")',
  },
  {
    part: "Dish",
    goesTo:
      "a line on the menu, joined to the dish of that name already in Capsule; a name with no dish is listed on screen",
  },
  {
    part: "Dish description",
    goesTo:
      "not copied: the dish keeps its own description from the Menu Items Export (the same text)",
  },
  {
    part: "Package and seasonal prices",
    goesTo:
      'not in the file (printed with "Show Prices?" off); each package menu starts with no price and no season',
  },
];

export interface OldMenuPackageGroup {
  label: string;
  note: string;
  pickOne: boolean;
  dishes: string[];
}

export interface OldMenuPackage {
  name: string;
  description: string;
  groups: OldMenuPackageGroup[];
}

export interface PackageReportLine {
  text: string;
  look: XlsxCellLook | undefined;
}

/** True when the grid is TPP's Menu Item Packages report. */
export function isMenuPackagesReport(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): boolean {
  return grid
    .slice(0, 3)
    .some((cells) => (cells[0] ?? "").trim() === "Menu Item Packages");
}

/** "Choice of 1 Salad", "Rice (choose one)", "Select a Salad" - guests pick one. */
export function isPickOneGroup(label: string): boolean {
  return (
    /\b(select|selecte|choose|pick)\s+(1|one|a|an)\b/i.test(label) ||
    /\bchoice of (1|one)\b/i.test(label) ||
    /\(\s*(select|selecte|choose)?\s*(1|one)\s*\)/i.test(label)
  );
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const groupLabel = (text: string) => clean(text).replace(/\s*:$/, "");
const isBlue = (look: XlsxCellLook) =>
  look.color !== null && look.color.toUpperCase() !== "FF000000";

export function menuPackagesFromLines(
  lines: ReadonlyArray<PackageReportLine>,
): OldMenuPackage[] {
  const packages: OldMenuPackage[] = [];
  let current: OldMenuPackage | null = null;
  let last: "package" | "group" | "dish" | null = null;
  for (const { text: raw, look } of lines) {
    const text = clean(raw);
    if (text === "" || /^Printed Date:?$/i.test(text)) continue;
    if (!current && text === "Menu Item Packages") continue;
    const bold = look?.bold ?? false;
    if (bold && look?.bottomBorder) {
      current = {
        name: text,
        description: "",
        groups: [{ label: "", note: "", pickOne: false, dishes: [] }],
      };
      packages.push(current);
      last = "package";
    } else if (!current) {
      continue;
    } else if (bold && look && isBlue(look) && !look.italic) {
      current.groups.push({
        label: groupLabel(text),
        note: "",
        pickOne: false,
        dishes: [],
      });
      last = "group";
    } else if (bold) {
      current.groups[current.groups.length - 1]!.dishes.push(text);
      last = "dish";
    } else if (last === "package") {
      current.description = clean(`${current.description} ${text}`);
    } else if (last === "group") {
      const group = current.groups[current.groups.length - 1]!;
      group.note = clean(`${group.note} ${text}`);
    }
    // A dish's own description is the dish's text in the Menu Items Export.
  }
  // Two packages of one name (the old system lets that happen) stay apart.
  const seen = new Map<string, number>();
  for (const pack of packages) {
    pack.groups = pack.groups.filter(
      (group) => group.label !== "" || group.dishes.length > 0,
    );
    // "Bread Option" with the note "Choose one" is a pick-one group too.
    for (const group of pack.groups)
      group.pickOne =
        group.label !== "" &&
        (isPickOneGroup(group.label) || isPickOneGroup(group.note));
    const key = pack.name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) pack.name = `${pack.name} (${count})`;
  }
  return packages;
}

/** Read the report straight from the unzipped .xlsx (the fonts are needed). */
export function menuPackagesFromEntries(
  entries: ZipEntryMap,
): OldMenuPackage[] {
  const sheet = readXlsxWorkbookFromEntries(entries).sheets[0];
  const looks = readXlsxCellLooksFromEntries(entries)[0];
  const lines = (sheet?.cells ?? [])
    .filter((cell) => /^A\d+$/.test(cell.ref))
    .map((cell) => ({
      text: XlsxReportGrid.cellText(cell),
      look: looks?.get(cell.ref),
    }));
  // Only the Menu Item Packages report: another styled workbook would turn
  // its bold cells into bogus menus.
  if (!isMenuPackagesReport(lines.slice(0, 3).map((line) => [line.text])))
    return [];
  return menuPackagesFromLines(lines);
}
