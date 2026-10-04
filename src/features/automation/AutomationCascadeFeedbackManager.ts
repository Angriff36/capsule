import type { ActionResultAction } from "../../ui/action-result";
import { stockLineLink } from "../inventory/stockLevels";

type CascadePublisher = (
  message: string,
  actions?: readonly ActionResultAction[],
) => void;

/**
 * Turns completed Manifest reaction cascades into plain-language operator
 * feedback. Callers supply the publisher so this layer stays independent of
 * the shared notice singleton and never recreates a domain reaction.
 */
export class AutomationCascadeFeedbackManager {
  constructor(private readonly publish: CascadePublisher) {}

  eventApproved(eventId: string): void {
    this.publish("Event approved. Purchase planning is up to date.", [
      {
        label: "View purchase needs",
        to: `/inventory/purchasing?event=${eventId}`,
      },
    ]);
  }

  wasteRecorded(inventoryItemId: string, quantity: number, unit: string): void {
    this.publish(`Waste recorded. Stock reduced by ${quantity} ${unit}.`, [
      { label: "View stock line", to: stockLineLink(inventoryItemId) },
    ]);
  }
}
