// The public menu reads like the printed menu book: short diet marks and
// dishes under course headings (work/mangia-menu-catalog-redesign.pdf).
import { describe, expect, it } from "vitest";
import { courseGroups, dietMark } from "../src/features/sales/publicMenuText";

describe("public menu diet marks", () => {
  it("reads hand-typed diet tags as the menu book marks", () => {
    expect(dietMark("Gluten free")?.mark).toBe("GF");
    expect(dietMark("gluten-free")?.mark).toBe("GF");
    expect(dietMark("GF")?.mark).toBe("GF");
    expect(dietMark("Vegetarian")?.mark).toBe("V");
    expect(dietMark("vegan")?.mark).toBe("VG");
    expect(dietMark("Dairy Free")?.mark).toBe("DF");
    expect(dietMark("nut free")?.mark).toBe("NF");
    expect(dietMark("Kosher")).toBeNull();
  });
});

describe("public menu course headings", () => {
  it("keeps menu order, joins a course however it is typed, puts no-course dishes first", () => {
    const groups = courseGroups([
      { name: "Roulade", course: "Passed hors d'oeuvres" },
      { name: "Salad", course: "Salad" },
      { name: "Bao", course: "passed hors d'oeuvres " },
      { name: "Rolls", course: null },
    ]);
    expect(groups.map((g) => [g.course, g.dishes.map((d) => d.name)])).toEqual([
      [null, ["Rolls"]],
      ["Passed hors d'oeuvres", ["Roulade", "Bao"]],
      ["Salad", ["Salad"]],
    ]);
  });
});
