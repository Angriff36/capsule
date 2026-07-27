import { AGENT_AC_CAPABILITY_IDS } from "./CapsuleCommandMutationMap";

/**
 * Authored proof that a kitchen user can invoke the command from Capsule UI.
 * Signal = feature file imports/calls the listed generated hook(s).
 * `null` = agent/backend only — no authored UI call site yet.
 */
export interface CapsuleCommandUiSurface {
  hooks: readonly string[];
  surfaces: readonly string[];
}

/**
 * Known UI call sites for the north-star AC set (and any others we track).
 * Missing capabilityId ⇒ no authored UI yet (still executable via MCP).
 * Keep AC entries in sync with `src/features/**` call sites.
 */
export const CAPABILITY_UI_SURFACES: Readonly<
  Record<string, CapsuleCommandUiSurface | null>
> = {
  "Ingredient.introduce": {
    hooks: ["useCreateIngredient"],
    surfaces: ["src/features/kitchen/KitchenCatalogPage.tsx"],
  },
  "Component.draft": {
    hooks: ["useCreateComponent"],
    surfaces: ["src/features/kitchen/KitchenCatalogPage.tsx"],
  },
  "ComponentIngredient.add": {
    hooks: ["useCreateComponentIngredient"],
    surfaces: ["src/features/kitchen/ComponentDetailPage.tsx"],
  },
  "ComponentImport.upload": null,
  "Dish.introduce": {
    hooks: ["useCreateDish"],
    surfaces: ["src/features/kitchen/KitchenCatalogPage.tsx"],
  },
  "DishComponent.attach": null,
  "DishTask.add": {
    hooks: ["useCreateDishTask"],
    surfaces: ["src/features/kitchen/DishDetailPage.tsx"],
  },
  "Menu.draft": {
    hooks: ["useCreateMenu"],
    surfaces: ["src/features/kitchen/KitchenCatalogPage.tsx"],
  },
  "PrepTask.open": {
    hooks: ["useCreatePrepTask"],
    surfaces: [
      "src/features/production/PrepBoardPage.tsx",
      "src/features/kitchen/EventMenuPage.tsx",
      "src/features/kitchen/KitchenDashboardPage.tsx",
      "src/features/events/EventMenuTab.tsx",
    ],
  },
  "PrepTask.assign": {
    hooks: ["usePrepTaskAssign"],
    surfaces: ["src/features/kitchen/KitchenDashboardPage.tsx"],
  },
  "PrepTask.refreshGenerated": {
    hooks: ["usePrepTaskRefreshGenerated"],
    surfaces: [
      "src/features/production/PrepBoardPage.tsx",
      "src/features/kitchen/EventMenuPage.tsx",
      "src/features/kitchen/KitchenDashboardPage.tsx",
      "src/features/events/EventMenuTab.tsx",
    ],
  },
  "IngredientDemand.calculate": {
    hooks: ["useCreateIngredientDemand"],
    surfaces: ["src/features/inventory/DemandLedgerPage.tsx"],
  },
  "IngredientDemand.confirm": {
    hooks: ["useIngredientDemandConfirm"],
    surfaces: ["src/features/events/EventInventoryPanel.tsx"],
  },
  "IngredientDemand.recalculate": null,
  "IngredientDemand.supersede": {
    hooks: ["useIngredientDemandSupersede"],
    surfaces: ["src/features/inventory/DemandLedgerPage.tsx"],
  },
  "Client.register": {
    hooks: ["useCreateClient"],
    surfaces: [
      "src/features/clients/ClientsPage.tsx",
      "src/features/events/EventCreatePage.tsx",
    ],
  },
  "Vendor.onboard": {
    hooks: ["useCreateVendor"],
    surfaces: ["src/features/inventory/PurchasingPage.tsx"],
  },
  "WeeklyPurchasingConfig.configure": null,
  "Event.planEngagement": {
    hooks: ["useCreateEvent"],
    surfaces: ["src/features/events/EventCreatePage.tsx"],
  },
  "EventDish.addToEvent": {
    hooks: ["useCreateEventDish"],
    surfaces: [
      "src/features/kitchen/EventMenuPage.tsx",
      "src/features/events/EventMenuTab.tsx",
    ],
  },
  "Event.submitForApproval": {
    hooks: ["useEventSubmitForApproval"],
    surfaces: ["src/features/events/EventDetailPage.tsx"],
  },
  "Event.approve": {
    hooks: ["useEventApprove"],
    surfaces: ["src/features/events/EventDetailPage.tsx"],
  },
  "SavedReportDefinition.createDefinition": {
    hooks: ["useCreateSavedReportDefinition"],
    surfaces: ["src/features/reports/ReportsPage.tsx"],
  },
  "SavedReportDefinition.rename": {
    hooks: ["useSavedReportDefinitionRename"],
    surfaces: ["src/features/reports/ReportsPage.tsx"],
  },
  "SavedReportDefinition.changeSharing": {
    hooks: ["useSavedReportDefinitionChangeSharing"],
    surfaces: ["src/features/reports/ReportsPage.tsx"],
  },
  "SavedReportDefinition.archive": {
    hooks: ["useSavedReportDefinitionArchive"],
    surfaces: ["src/features/reports/ReportsPage.tsx"],
  },
  "SavedReportDefinition.restore": {
    hooks: ["useSavedReportDefinitionRestore"],
    surfaces: ["src/features/reports/ReportsPage.tsx"],
  },
  "SavedReportDefinition.updateDefinition": null,
};

export class CapsuleCommandUiCoverage {
  constructor(
    private readonly surfaces: Readonly<
      Record<string, CapsuleCommandUiSurface | null>
    > = CAPABILITY_UI_SURFACES,
  ) {}

  hasUi(capabilityId: string): boolean {
    return this.surfaces[capabilityId] != null;
  }

  surface(capabilityId: string): CapsuleCommandUiSurface | null {
    if (!(capabilityId in this.surfaces)) {
      return null;
    }
    return this.surfaces[capabilityId] ?? null;
  }

  /** Capability ids with no authored UI call site. */
  gaps(capabilityIds: readonly string[]): string[] {
    return capabilityIds.filter((id) => !this.hasUi(id));
  }

  /** Ensure every north-star AC id is explicitly tracked (surface or null). */
  assertAcSurfacesRecorded(
    capabilityIds: readonly string[] = AGENT_AC_CAPABILITY_IDS,
  ): void {
    for (const id of capabilityIds) {
      if (!(id in this.surfaces)) {
        throw new Error(
          `CAPABILITY_UI_SURFACES missing AC id '${id}' — mark a UI surface or null.`,
        );
      }
    }
  }
}
