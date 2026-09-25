import { describe, expect, it } from "vitest";
import { EventArchiveVisibility } from "../../../src/features/events/eventArchiveVisibility";

describe("EventArchiveVisibility", () => {
  const rows = [
    { _id: "live", deletedAt: null, archivedAt: null },
    { _id: "archived", deletedAt: null, archivedAt: 1_700_000_000_000 },
    { _id: "deleted", deletedAt: 1_700_000_000_000, archivedAt: null },
  ];

  it("treats only a finite archivedAt as archived", () => {
    expect(EventArchiveVisibility.isArchived(rows[1]!)).toBe(true);
    expect(EventArchiveVisibility.isArchived(rows[0]!)).toBe(false);
    expect(EventArchiveVisibility.isArchived({ archivedAt: Number.NaN })).toBe(
      false,
    );
  });

  it("hides archived and deleted rows by default", () => {
    const visible = EventArchiveVisibility.visibleRows(rows, {
      showArchived: false,
    });
    expect(visible.map((row) => row._id)).toEqual(["live"]);
  });

  it("brings archived rows back when asked, never deleted ones", () => {
    const visible = EventArchiveVisibility.visibleRows(rows, {
      showArchived: true,
    });
    expect(visible.map((row) => row._id)).toEqual(["live", "archived"]);
  });

  it("treats a missing list as an empty one", () => {
    expect(
      EventArchiveVisibility.visibleRows(undefined, { showArchived: true }),
    ).toEqual([]);
  });
});
