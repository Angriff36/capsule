import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  CREATE_ROLES,
  INGREDIENT_UNITS,
} from "../src/ui/InlineReferenceCreateSheet";

const baseManifest = readFileSync("src/foundation/base.manifest", "utf8");
const ingredientManifest = readFileSync(
  "src/culinary/ingredient.manifest",
  "utf8",
);

it("keeps inline creation roles aligned with the manifest capability hierarchy", () => {
  expect(baseManifest).toContain("role sales_staff extends staff");
  expect(baseManifest).toContain("allow salesAccess");
  expect(CREATE_ROLES.client).toEqual([
    "admin",
    "owner",
    "sales_manager",
    "sales_staff",
    "system",
  ]);
  expect(CREATE_ROLES.ingredient).toEqual([
    "admin",
    "kitchen_lead",
    "kitchen_manager",
    "kitchen_staff",
    "owner",
    "system",
  ]);
  expect(CREATE_ROLES.vendor).toEqual([
    "admin",
    "inventory_manager",
    "owner",
    "procurement_staff",
    "system",
  ]);
  // Venue.register requires eventManageAccess: only event_manager and its
  // inherited administrator/owner/system roles satisfy both event capabilities.
  expect(CREATE_ROLES.venue).toEqual([
    "admin",
    "event_manager",
    "owner",
    "system",
  ]);
  expect(baseManifest).toContain("allow eventAccess");
  expect(baseManifest).toContain("allow eventManageAccess");
});

it("keeps inline ingredient units aligned with UnitOfMeasure", () => {
  const body = ingredientManifest.match(
    /enum UnitOfMeasure \{([\s\S]*?)\n\}/,
  )?.[1];
  expect(body).toBeTruthy();
  const manifestUnits = body!
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[a-z_]+$/.test(line));
  expect([...INGREDIENT_UNITS]).toEqual(manifestUnits);
});
