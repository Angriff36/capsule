/**
 * The old system's Menu Item Packages report (PL-SOURCE-DATASETS, AC-057
 * "catalog ... packages"): every line is in column A and only the font says
 * what it is - bold with a rule line = package, bold blue = choice group,
 * bold italic = dish, plain = the description of the line above. Shapes are
 * the real report's (Menu_Item_Packages.xlsx, 74 packages, 46 pages).
 */
import { describe, expect, it } from "vitest";
import {
  isMenuPackagesReport,
  isPickOneGroup,
  menuPackagesFromLines,
  TPP_MENU_PACKAGE_PARTS,
  type PackageReportLine,
} from "../src/lib/tppReports/parseMenuPackages";

const look = (bold: boolean, italic = false, color: string | null = null) => ({
  bold,
  italic,
  color,
  bottomBorder: false,
});
const pack = (text: string): PackageReportLine => ({
  text,
  look: { ...look(true), bottomBorder: true },
});
const group = (text: string): PackageReportLine => ({
  text,
  look: look(true, false, "FF0000FF"),
});
const dish = (text: string): PackageReportLine => ({
  text,
  look: look(true, true),
});
const plain = (text: string): PackageReportLine => ({
  text,
  look: look(false),
});

const REPORT: PackageReportLine[] = [
  { text: "Menu Item Packages", look: look(true) },
  pack("Action Station - Asian"),
  plain("BUN STATION\nPork Belly Bao Bun - sous vide pork belly."),
  dish("Dumpling Station Action Station"),
  plain("Steamed and fried assorted dumplings."),
  group("Asian Station Protein"),
  plain("Top your noodles with chile - ginger seared"),
  plain("shrimp or teriyaki chicken."),
  dish("Kalbi Korean Beef"),
  plain("Printed Date:"),
  dish("Teriyaki Chicken"),
  pack("Traditional Option 3 - Glazed \nHam"),
  group("Protein"),
  dish("Honey Glazed Ham"),
  group("Salad (select 1)"),
  dish("Mixed Green Salad with Ranch Dressing"),
  dish("Mixed Green Salad with Italian Dressing"),
  group("Bread Option"),
  plain("Choose one"),
  dish("Garlic Bread"),
  dish("Dinner Rolls"),
  group("No modifications available for this station."),
  pack("Traditional Option 3 - Glazed Ham"),
  group("Protein"),
  dish("Honey Glazed Ham"),
];

describe("old-system menu packages report", () => {
  it("knows the report by its title", () => {
    expect(isMenuPackagesReport([["Menu Item Packages"], [], []])).toBe(true);
    expect(isMenuPackagesReport([["Venue Listing"]])).toBe(false);
  });

  it("reads packages, groups, dishes and notes by font, across a page break", () => {
    const packages = menuPackagesFromLines(REPORT);
    expect(packages.map((p) => p.name)).toEqual([
      "Action Station - Asian",
      "Traditional Option 3 - Glazed Ham",
      "Traditional Option 3 - Glazed Ham (2)",
    ]);
    const [asian, ham] = packages;
    expect(asian!.description).toBe(
      "BUN STATION Pork Belly Bao Bun - sous vide pork belly.",
    );
    expect(asian!.groups).toEqual([
      {
        label: "",
        note: "",
        pickOne: false,
        dishes: ["Dumpling Station Action Station"],
      },
      {
        label: "Asian Station Protein",
        note: "Top your noodles with chile - ginger seared shrimp or teriyaki chicken.",
        pickOne: false,
        dishes: ["Kalbi Korean Beef", "Teriyaki Chicken"],
      },
    ]);
    expect(ham!.groups.map((g) => [g.label, g.pickOne, g.dishes])).toEqual([
      ["Protein", false, ["Honey Glazed Ham"]],
      [
        "Salad (select 1)",
        true,
        [
          "Mixed Green Salad with Ranch Dressing",
          "Mixed Green Salad with Italian Dressing",
        ],
      ],
      ["Bread Option", true, ["Garlic Bread", "Dinner Rolls"]],
      ["No modifications available for this station.", false, []],
    ]);
  });

  it("tells pick-one groups by the old system's wording", () => {
    for (const label of [
      "Choice of 1 Salad",
      "Rice (choose one)",
      "Bean Option (select 1)",
      "Select Bean Option (1)",
      "Choice of Pasta (selecte one)",
      "Select a Salad",
    ])
      expect(isPickOneGroup(label), label).toBe(true);
    for (const label of [
      "Choice of 2 Meats",
      "Select Two Sides",
      "Protein (choose two)",
      "Popcorn Options (select up to three)",
      "Sides",
    ])
      expect(isPickOneGroup(label), label).toBe(false);
  });

  it("states where every part goes, prices and seasons included", () => {
    expect(TPP_MENU_PACKAGE_PARTS.map((part) => part.part)).toEqual([
      "Package name",
      "Package description",
      "Choice group",
      "Choice group note",
      "Dish",
      "Dish description",
      "Package and seasonal prices",
    ]);
  });
});
