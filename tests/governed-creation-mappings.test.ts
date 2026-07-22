import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("governed creation mappings", () => {
  it("keeps every generated createVia selection stable", () => {
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    const mappings = [...mutations.matchAll(/export const (\w+_createVia\w+)/g)]
      .map((match) => match[1])
      .sort();

    expect(mappings).toEqual([
      "AvailabilityWindow_createViaDeclare",
      "ClientContact_createViaAdd",
      "Client_createViaRegister",
      "Contract_createViaDraft",
      "Delivery_createViaSchedule",
      "DishRecipe_createViaAttach",
      "DishTask_createViaAdd",
      "Dish_createViaIntroduce",
      "EventAllergenCheck_createViaRecord",
      "EventAssignment_createViaAssign",
      "EventCloseout_createViaCapture",
      "EventDishRecipeSeed_createViaSeed",
      "EventDish_createViaAddToEvent",
      "EventGuest_createViaInvite",
      "EventIngredientContribution_createViaRecord",
      "Event_createViaPlanEngagement",
      "Incident_createViaReport",
      "IngredientDemand_createViaCalculate",
      "Ingredient_createViaIntroduce",
      "InventoryItem_createViaOpen",
      "InventoryReservation_createViaReserve",
      "Invoice_createViaIssue",
      "MenuDish_createViaAdd",
      "Menu_createViaDraft",
      "OrganizationCapabilitySetting_createViaRegister",
      "Organization_createViaRegister",
      "PackListItem_createViaAddItem",
      "PackList_createViaOpen",
      "PaymentMethod_createViaRegister",
      "Payment_createViaRecord",
      "PayrollInput_createViaPrepare",
      "Person_createViaHire",
      "PrepTask_createViaOpen",
      "ProductionBatch_createViaPlan",
      "Proposal_createViaDraft",
      "Qualification_createViaGrant",
      "QualityCheck_createViaOpen",
      "RecipeImportLine_createViaStage",
      "RecipeImport_createViaUpload",
      "RecipeIngredient_createViaAdd",
      "RecipeStep_createViaAdd",
      "Recipe_createViaDraft",
      "SavedReportDefinition_createViaCreateDefinition",
      "Shift_createViaSchedule",
      "StorageLocation_createViaRegister",
      "TimeRecord_createViaClockIn",
      "VendorOrderLineDemand_createViaLink",
      "VendorOrderLine_createViaAddLine",
      "VendorOrder_createViaOpen",
      "Vendor_createViaOnboard",
      "Venue_createViaRegister",
      "WasteRecord_createViaRecord",
      "WeeklyPurchasingConfig_createViaConfigure",
    ]);
    expect(mutations).not.toContain("QualityCheck_createViaFail");
  });
});
