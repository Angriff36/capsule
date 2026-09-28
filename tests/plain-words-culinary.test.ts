import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on culinary manifests", () => {
  it("keeps leftover culinary-manifest policy copy free of command jargon", () => {
    const files = [
      "src/culinary/component-import.manifest",
      "src/culinary/component.manifest",
      "src/culinary/dish-container.manifest",
      "src/culinary/dish.manifest",
      "src/culinary/event-dish.manifest",
      "src/culinary/ingredient.manifest",
      "src/culinary/menu-dish.manifest",
      "src/culinary/menu.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute event dish commands",
      "execute ingredient commands",
      "execute dish commands",
      "execute menu commands",
      "execute component commands",
      "execute component import commands",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Managers, sales and kitchen staff may update event dishes",
      "Managers, sales and kitchen staff may change event dishes",
      "Managers and kitchen staff may update event dish overrides",
      "Managers and kitchen staff may change event dish overrides",
      "Kitchen staff may update ingredients",
      "Kitchen staff may change ingredients",
      "Kitchen, inventory and managers may update unit mappings",
      "Kitchen, inventory and managers may change unit mappings",
      "Kitchen staff and managers may update dishes",
      "Kitchen staff and managers may change dishes",
      "Kitchen staff may update dish ingredient lines",
      "Kitchen staff may change dish ingredient lines",
      "Kitchen staff may update dish recipes",
      "Kitchen staff may change dish recipes",
      "Kitchen staff and managers may update dish task templates",
      "Kitchen staff and managers may change dish task templates",
      "Kitchen staff and managers may update task materials",
      "Kitchen staff and managers may change task materials",
      "Kitchen staff may update dish containers",
      "Kitchen staff may change dish containers",
      "Kitchen staff may update recipes",
      "Kitchen staff may change recipes",
      "Kitchen staff may update recipe ingredient lines",
      "Kitchen staff may change recipe ingredient lines",
      "Kitchen staff may update recipe steps",
      "Kitchen staff may change recipe steps",
      "Kitchen staff may update recipe versions",
      "Kitchen staff may change recipe versions",
      "Kitchen staff may update nested recipe lines",
      "Kitchen staff may change nested recipe lines",
      "Kitchen staff may update portion sizes",
      "Kitchen staff may change portion sizes",
      "Kitchen staff may update recipe imports",
      "Kitchen staff may change recipe imports",
      "Kitchen staff may update recipe import lines",
      "Kitchen staff may change recipe import lines",
      "Kitchen staff may update menus",
      "Kitchen staff may change menus",
      "Kitchen staff may update menu dish lines",
      "Kitchen staff may change menu dish lines",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover culinary READ copy free of component jargon", () => {
    const files = [
      "src/culinary/component.manifest",
      "src/culinary/component-import.manifest",
      "src/culinary/dish.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Kitchen staff may read components",
      "Kitchen staff may read component ingredient lines",
      "Kitchen staff may read component steps",
      "Kitchen staff may read component version history",
      "Kitchen staff may read portion specs",
      "Kitchen staff may read component imports",
      "Kitchen staff may read component import lines",
      "Kitchen staff may read dish component composition",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Kitchen staff may see recipes",
      "Kitchen staff may see recipe ingredient lines",
      "Kitchen staff may see recipe steps",
      "Kitchen staff may see recipe versions",
      "Kitchen staff may see portion sizes",
      "Kitchen staff may see recipe imports",
      "Kitchen staff may see recipe import lines",
      "Kitchen staff may see dish recipes",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed write leftovers must stay put
    expect(visible).toContain("Kitchen staff may update recipes");
    expect(visible).toContain("Kitchen staff may update recipe imports");
    expect(visible).toContain("Kitchen staff may update portion sizes");
    expect(visible).toContain("Kitchen staff may update dish recipes");

    // later leftovers stay as-is
    expect(visible).toContain(
      "This portion size's piece amount has to be more than zero.",
    );
  });

  it("keeps leftover culinary READ copy free of read jargon", () => {
    const files = [
      "src/culinary/component.manifest",
      "src/culinary/component-import.manifest",
      "src/culinary/dish.manifest",
      "src/culinary/dish-container.manifest",
      "src/culinary/event-dish.manifest",
      "src/culinary/ingredient.manifest",
      "src/culinary/menu.manifest",
      "src/culinary/menu-dish.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Kitchen staff may read nested recipe lines",
      "Kitchen, sales and managers may read dishes",
      "Kitchen staff may read dish ingredient lines",
      "Kitchen staff and managers may read dish task templates",
      "Kitchen staff and managers may read task materials",
      "Kitchen staff may read dish containers",
      "Kitchen staff may read ingredients",
      "Kitchen, inventory and managers may read unit mappings",
      "Kitchen and sales staff may read menus",
      "Kitchen and sales staff may read menu dish lines",
      "Employed staff may read event dishes",
      "Employed staff may read event dish overrides",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Kitchen staff may see nested recipe lines",
      "Kitchen, sales and managers may see dishes",
      "Kitchen staff may see dish ingredient lines",
      "Kitchen staff and managers may see dish task templates",
      "Kitchen staff and managers may see task materials",
      "Kitchen staff may see dish containers",
      "Kitchen staff may see ingredients",
      "Kitchen, inventory and managers may see unit mappings",
      "Kitchen and sales staff may see menus",
      "Kitchen and sales staff may see menu dish lines",
      "Employed staff may see event dishes",
      "Employed staff may see event dish overrides",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed write leftovers must stay put
    expect(visible).toContain("Kitchen staff may update nested recipe lines");
    expect(visible).toContain("Kitchen staff and managers may update dishes");
    expect(visible).toContain("Kitchen staff may update dish ingredient lines");
    expect(visible).toContain("Kitchen staff may update ingredients");
    expect(visible).toContain(
      "Kitchen, inventory and managers may update unit mappings",
    );
    expect(visible).toContain("Kitchen staff may update menus");
    expect(visible).toContain(
      "Managers, sales and kitchen staff may update event dishes",
    );
    expect(visible).toContain(
      "Managers and kitchen staff may update event dish overrides",
    );

    // already-landed READ leftovers must stay put
    expect(visible).toContain("Kitchen staff may see recipes");
    expect(visible).toContain("Kitchen staff may see dish recipes");
    expect(visible).toContain("Kitchen staff may see portion sizes");

    // leftover constraint stays as-is
    expect(visible).toContain(
      "This portion size's piece amount has to be more than zero.",
    );
  });

  it("keeps leftover culinary portion-size constraint copy free of spec jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/culinary/component.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Portion spec name is required");
    expect(visible).toContain("Give this portion size a name.");
    expectPlain("Give this portion size a name.");

    // already-landed portion-size leftovers must stay put
    expect(visible).toContain("Kitchen staff may see portion sizes");
    expect(visible).toContain("Kitchen staff may update portion sizes");
    expect(visible).toContain("Kitchen staff may change portion sizes");

    // later leftover, unchanged
    expect(visible).toContain(
      "This portion size's piece amount has to be more than zero.",
    );
  });

  it("keeps leftover culinary recipe-name constraint copy free of component jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/culinary/component.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Component name is required");
    expect(visible).toContain("Give this recipe a name.");
    expectPlain("Give this recipe a name.");

    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Component name is required");
    expect(mutations).toContain("Give this recipe a name.");

    // later leftovers, unchanged
    expect(visible).toContain(
      "This portion size's piece amount has to be more than zero.",
    );

    // already-landed leftovers must stay put
    expect(visible).toContain("Give this portion size a name.");
    expect(visible).toContain("Kitchen staff may see recipes");
  });

  it("keeps leftover culinary yield-and-batch constraint copy free of component jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/culinary/component.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Component yield quantity must be positive");
    expect(visible).not.toContain(
      "Component batch multiplier must be positive",
    );
    expect(visible).toContain(
      "This recipe's yield has to be more than zero. Enter how much it makes.",
    );
    expect(visible).toContain(
      "This recipe's batch size has to be more than zero.",
    );
    expectPlain(
      "This recipe's yield has to be more than zero. Enter how much it makes.",
    );
    expectPlain("This recipe's batch size has to be more than zero.");

    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Component yield quantity must be positive",
    );
    expect(mutations).not.toContain(
      "Component batch multiplier must be positive",
    );
    expect(mutations).toContain(
      "This recipe's yield has to be more than zero. Enter how much it makes.",
    );
    expect(mutations).toContain(
      "This recipe's batch size has to be more than zero.",
    );

    // later leftovers, unchanged
    expect(visible).toContain(
      "This portion size's piece amount has to be more than zero.",
    );

    // already-landed leftovers must stay put
    expect(visible).toContain("Give this recipe a name.");
    expect(visible).toContain("Give this portion size a name.");
    expect(visible).toContain("Kitchen staff may see recipes");
  });

  it("keeps leftover culinary ingredient-step-and-drafted-name constraint copy free of component jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/culinary/component.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain(
      "Component ingredient quantity must be positive",
    );
    expect(visible).not.toContain("Component steps require an instruction");
    expect(visible).not.toContain("Drafted components require a name");
    expect(visible).toContain(
      "This recipe ingredient's amount has to be more than zero.",
    );
    expect(visible).toContain("Give this recipe step an instruction.");
    expect(visible).toContain("Give this recipe a name.");
    expectPlain("This recipe ingredient's amount has to be more than zero.");
    expectPlain("Give this recipe step an instruction.");
    expectPlain("Give this recipe a name.");

    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Component ingredient quantity must be positive",
    );
    expect(mutations).toContain(
      "This recipe ingredient's amount has to be more than zero.",
    );

    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).not.toContain("Component steps require an instruction");
    expect(summary).not.toContain("Drafted components require a name");
    expect(summary).toContain("Give this recipe step an instruction.");
    expect(summary).toContain("Give this recipe a name.");

    // later leftovers, unchanged
    expect(visible).toContain(
      "This portion size's piece amount has to be more than zero.",
    );

    // already-landed leftovers must stay put
    expect(visible).toContain("Give this recipe a name.");
    expect(visible).toContain(
      "This recipe's yield has to be more than zero. Enter how much it makes.",
    );
    expect(visible).toContain(
      "This recipe's batch size has to be more than zero.",
    );
    expect(visible).toContain("Give this portion size a name.");
    expect(visible).toContain("Kitchen staff may see recipes");
  });

  it("keeps leftover culinary step-instruction-and-duration constraint copy free of component jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/culinary/component.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Component step instruction is required");
    expect(visible).not.toContain("Component step duration cannot be negative");
    expect(visible).toContain("Give this recipe step an instruction.");
    expect(visible).toContain(
      "This recipe step's time can't be negative. Use zero or more minutes.",
    );
    expectPlain("Give this recipe step an instruction.");
    expectPlain(
      "This recipe step's time can't be negative. Use zero or more minutes.",
    );

    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Component step instruction is required");
    expect(mutations).not.toContain(
      "Component step duration cannot be negative",
    );
    expect(mutations).toContain("Give this recipe step an instruction.");
    expect(mutations).toContain(
      "This recipe step's time can't be negative. Use zero or more minutes.",
    );

    // later leftover, unchanged
    expect(visible).toContain(
      "This portion size's piece amount has to be more than zero.",
    );

    // already-landed leftovers must stay put
    expect(visible).toContain("Give this recipe a name.");
    expect(visible).toContain(
      "This recipe's yield has to be more than zero. Enter how much it makes.",
    );
    expect(visible).toContain(
      "This recipe's batch size has to be more than zero.",
    );
    expect(visible).toContain(
      "This recipe ingredient's amount has to be more than zero.",
    );
    expect(visible).toContain("Give this recipe step an instruction.");
    expect(visible).toContain("Give this recipe a name.");
    expect(visible).toContain("Give this portion size a name.");
    expect(visible).toContain("Kitchen staff may see recipes");
  });
});
