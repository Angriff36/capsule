import { useRef } from "react";
import type {
  CapsuleCommandExecutor,
  CapsuleCommandInvocation,
} from "../../../agent/CapsuleCommandExecutor";
import {
  useClientChangeContact,
  useCreateClient,
  useCreateClientContact,
  useCreateDish,
  useCreateEvent,
  useCreateEventAssignment,
  useCreateEventDish,
  useCreateEventStaffNeed,
  useCreateEventTimelineActivity,
  useCreateIngredient,
  useCreateInvoice,
  useCreatePackList,
  useCreatePackListItem,
  useCreatePayment,
  useCreatePrepTask,
  useCreateProposal,
  useCreateProposalLineItem,
  useCreateReviewFlag,
  useCreateVendor,
  useCreateVendorOrder,
  useCreateVendorOrderLine,
  useCreateVenue,
  useEventChangePricing,
  useEventChangePrimaryContact,
  useEventChangeHeadcount,
  useEventChangeRequirements,
  useEventChangeServiceStyle,
  useEventChangeVenue,
  useEventReschedule,
  useEventSetEventNumber,
  useEventDishChangeCourse,
  useInvoiceSend,
  useInvoiceSetDeposit,
  usePaymentSettle,
  useProposalAccept,
} from "../../../lib/manifest-convex-react";
import { useSendProposalWithRevisionCapture } from "../../clients/useSendProposalWithRevisionCapture";

type CommandRunner = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Proposal.send takes the same authored seam the Sales screens and the
 * agent's `CapsuleCommandSeamRoutes` use, so an imported proposal gets the
 * price-override audit and the revision snapshot too (#241). The seam takes
 * no idempotency key; the plan only sends a proposal it just drafted.
 */
function useProposalSendWithRevisionCapture(): CommandRunner {
  const send = useSendProposalWithRevisionCapture();
  return (args) =>
    send({
      docId: args.docId as Parameters<typeof send>[0]["docId"],
      ...(typeof args.version === "number" ? { version: args.version } : {}),
      changeSummary: "Proposal sent from the TPP reports import",
    });
}

/**
 * The browser twin of the agent's `ConvexCommandClient`: every command an
 * event-bundle plan can emit, dispatched to the generated React hook for that
 * command. The hooks validate params (zod), coerce dates to epoch ms, and
 * carry the idempotency key — the same contract the MCP host runs, so a
 * re-import here or there adds what is missing instead of a second event.
 */
export interface EventImportCommandExecutor {
  executor: CapsuleCommandExecutor;
  /** Steps whose command this screen cannot run; empty means go ahead. */
  unsupported(capabilityIds: Iterable<string>): string[];
}

export function useEventImportCommandExecutor(): EventImportCommandExecutor {
  const runners: Record<string, CommandRunner> = {
    "Venue.register": useCreateVenue(),
    "Client.register": useCreateClient(),
    "Client.changeContact": useClientChangeContact(),
    "ClientContact.add": useCreateClientContact(),
    "Event.planEngagement": useCreateEvent(),
    "Event.changePricing": useEventChangePricing(),
    "Event.changePrimaryContact": useEventChangePrimaryContact(),
    "Event.changeRequirements": useEventChangeRequirements(),
    "Event.setEventNumber": useEventSetEventNumber(),
    "Event.reschedule": useEventReschedule(),
    "Event.changeHeadcount": useEventChangeHeadcount(),
    "Event.changeServiceStyle": useEventChangeServiceStyle(),
    "Event.changeVenue": useEventChangeVenue(),
    "EventTimelineActivity.schedule": useCreateEventTimelineActivity(),
    "Dish.introduce": useCreateDish(),
    "EventDish.addToEvent": useCreateEventDish(),
    "EventDish.changeCourse": useEventDishChangeCourse(),
    "PrepTask.open": useCreatePrepTask(),
    "PackList.open": useCreatePackList(),
    "PackListItem.addItem": useCreatePackListItem(),
    "EventAssignment.assign": useCreateEventAssignment(),
    "EventStaffNeed.postOpen": useCreateEventStaffNeed(),
    "ReviewFlag.raise": useCreateReviewFlag(),
    "Proposal.draft": useCreateProposal(),
    "ProposalLineItem.addLine": useCreateProposalLineItem(),
    "Proposal.send": useProposalSendWithRevisionCapture(),
    "Proposal.accept": useProposalAccept(),
    "Ingredient.introduce": useCreateIngredient(),
    "Vendor.onboard": useCreateVendor(),
    "VendorOrder.open": useCreateVendorOrder(),
    "VendorOrderLine.addLine": useCreateVendorOrderLine(),
    "Invoice.issue": useCreateInvoice(),
    "Invoice.setDeposit": useInvoiceSetDeposit(),
    "Invoice.send": useInvoiceSend(),
    "Payment.record": useCreatePayment(),
    "Payment.settle": usePaymentSettle(),
  };

  // Generated hooks hand back a fresh closure each render; keep the latest
  // set behind a stable executor so callers can hold one reference.
  const latest = useRef(runners);
  latest.current = runners;

  const stable = useRef<EventImportCommandExecutor>({
    executor: {
      async execute(invocation: CapsuleCommandInvocation): Promise<unknown> {
        const run = latest.current[invocation.capabilityId];
        if (!run) {
          throw new Error(
            `The import screen cannot run '${invocation.capabilityId}' — enter this bundle through the agent importer.`,
          );
        }
        return run(
          invocation.idempotencyKey
            ? { ...invocation.args, idempotencyKey: invocation.idempotencyKey }
            : invocation.args,
        );
      },
    },
    unsupported(capabilityIds) {
      const missing = new Set<string>();
      for (const id of capabilityIds) {
        if (!(id in latest.current)) missing.add(id);
      }
      return [...missing];
    },
  });
  return stable.current;
}
