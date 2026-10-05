import { describe, expect, it } from "vitest";
import {
  morePictures,
  pictureKind,
} from "../../src/features/attachments/pictureList";

const row = (
  id: string,
  contentType: string,
  uploadedAt: number,
  storageId = `s-${id}`,
) => ({
  _id: id,
  version: 1,
  fileName: `${id}.file`,
  contentType,
  storageId,
  uploadedAt,
  url: `https://files/${id}`,
});

describe("recipe and catalog pictures (spec 9.6 photos/video)", () => {
  it("keeps pictures and videos, not other files", () => {
    expect(pictureKind("image/jpeg")).toBe("picture");
    expect(pictureKind("Video/MP4")).toBe("video");
    expect(pictureKind("application/pdf")).toBeNull();
  });

  it("lists every kept picture and video oldest first, without the main picture", () => {
    const rows = [
      row("plating", "image/png", 30),
      row("main", "image/jpeg", 10, "main-blob"),
      row("spec", "application/pdf", 5),
      row("clip", "video/mp4", 20),
    ];
    expect(morePictures(rows, "main-blob").map((r) => [r._id, r.kind])).toEqual(
      [
        ["clip", "video"],
        ["plating", "picture"],
      ],
    );
  });

  it("shows every picture when there is no main picture yet", () => {
    expect(morePictures([row("a", "image/png", 1)], null)).toHaveLength(1);
    expect(morePictures(undefined, null)).toEqual([]);
  });
});
