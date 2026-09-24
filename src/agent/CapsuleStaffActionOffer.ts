import {
  AnnouncementPostAction,
  AnnouncementRemoveAction,
  IngredientDemandSyncFromContributionsAction,
} from "../generated/manifest-wiring-bindings";

export type StaffActionPresentation = {
  exposure: "human" | "internal";
  label: string;
  confirm: boolean;
  fields: ReadonlyArray<{
    name: string;
    label: string;
    required: boolean;
    choices?: ReadonlyArray<{ value: string; label: string }>;
  }>;
};

/**
 * What a staff screen may show for one command.
 * Reads the generated action facts. Internal commands stay out of the screen.
 */
export class CapsuleStaffActionOffer {
  private readonly byId: ReadonlyMap<string, StaffActionPresentation>;

  constructor(
    actions: ReadonlyArray<readonly [string, StaffActionPresentation]>,
  ) {
    this.byId = new Map(actions);
  }

  forPerson(capabilityId: string): StaffActionPresentation | null {
    const presentation = this.byId.get(capabilityId);
    if (!presentation || presentation.exposure !== "human") return null;
    return presentation;
  }

  stillCallableBySystem(capabilityId: string): boolean {
    return this.byId.has(capabilityId);
  }
}

/** Announcement board actions, taken from the generated bindings. */
export function announcementStaffActions(): CapsuleStaffActionOffer {
  return new CapsuleStaffActionOffer([
    ["Announcement.post", AnnouncementPostAction],
    ["Announcement.remove", AnnouncementRemoveAction],
    [
      "IngredientDemand.syncFromContributions",
      IngredientDemandSyncFromContributionsAction,
    ],
  ]);
}

/** True only when the generated action says the person must confirm first. */
export function staffActionNeedsConfirm(
  presentation: { confirm: boolean } | null,
): boolean {
  return presentation?.confirm === true;
}
