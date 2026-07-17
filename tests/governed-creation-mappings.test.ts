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
      "Dish_createViaIntroduce",
      "EventAllergenCheck_createViaRecord",
      "EventAssignment_createViaAssign",
      "EventCloseout_createViaCapture",
      "EventDish_createViaSelect",
      "EventGuest_createViaInvite",
      "Event_createViaPlanEngagement",
      "Incident_createViaReport",
      "IngredientDemand_createViaCalculate",
      "Ingredient_createViaIntroduce",
      "InventoryItem_createViaOpen",
      "InventoryReservation_createViaReserve",
      "Invoice_createViaIssue",
      "Menu_createViaDraft",
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
      "RecipeIngredient_createViaAdd",
      "Recipe_createViaDraft",
      "SavedReportDefinition_createViaCreateDefinition",
      "Shift_createViaSchedule",
      "StorageLocation_createViaRegister",
      "TimeRecord_createViaClockIn",
      "VendorOrderLine_createViaAddLine",
      "VendorOrder_createViaOpen",
      "Vendor_createViaOnboard",
      "Venue_createViaRegister",
      "WasteRecord_createViaRecord",
    ]);
    expect(mutations).not.toContain("QualityCheck_createViaFail");
  });
});
