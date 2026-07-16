import {
  EventGuestAssignTableCapability,
  EventGuestCheckInCapability,
  EventGuestRsvpConfirmLifecycle,
  EventGuestRsvpDeclineLifecycle,
  EventGuestWithdrawCapability,
} from "../../generated/manifest-wiring-bindings";

export interface GuestCapabilityState {
  rsvpStatus: string;
  checkedInAt?: number | null;
  deletedAt?: number | null;
}

export class EventGuestPolicy {
  canConfirm(guest: GuestCapabilityState): boolean {
    return (
      guest.deletedAt == null &&
      EventGuestRsvpConfirmLifecycle.some(
        (transition) => transition.from === guest.rsvpStatus,
      )
    );
  }

  canDecline(guest: GuestCapabilityState): boolean {
    return (
      guest.deletedAt == null &&
      EventGuestRsvpDeclineLifecycle.some(
        (transition) => transition.from === guest.rsvpStatus,
      )
    );
  }

  canCheckIn(guest: GuestCapabilityState): boolean {
    return (
      EventGuestCheckInCapability.capabilityId === "EventGuest.checkIn" &&
      guest.deletedAt == null &&
      guest.rsvpStatus === "confirmed" &&
      guest.checkedInAt == null
    );
  }

  canAssignTable(guest: GuestCapabilityState): boolean {
    return (
      EventGuestAssignTableCapability.capabilityId ===
        "EventGuest.assignTable" &&
      guest.deletedAt == null &&
      guest.rsvpStatus !== "declined"
    );
  }

  canWithdraw(guest: GuestCapabilityState): boolean {
    return (
      EventGuestWithdrawCapability.capabilityId === "EventGuest.withdraw" &&
      guest.deletedAt == null
    );
  }
}

export const eventGuestPolicy = new EventGuestPolicy();
