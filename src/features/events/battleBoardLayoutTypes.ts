/** Layout section types for the event battle board (capsule-pro + Mangia board). */
export const BATTLE_BOARD_LAYOUT_TYPES = [
  "Buffet",
  "Bar",
  "Stage",
  "Seating",
  "Kitchen",
  "Service",
  "Parking",
  "Other",
] as const;

export type BattleBoardLayoutType = (typeof BATTLE_BOARD_LAYOUT_TYPES)[number];
