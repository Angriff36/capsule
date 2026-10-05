import { describe, expect, it } from "vitest";
import {
  classifyDemandChange,
  demandPreviewFingerprint,
} from "../convex/lib/demandChangePreview";

describe("demand change preview helpers", () => {
  it("classifies every visible quantity outcome", () => {
    expect(classifyDemandChange(0, 4)).toBe("added");
    expect(classifyDemandChange(4, 0)).toBe("removed");
    expect(classifyDemandChange(4, 6)).toBe("changed");
    expect(classifyDemandChange(4, 4)).toBe("unchanged");
  });

  it("keeps the optimistic-concurrency fingerprint stable regardless of read order", () => {
    expect(demandPreviewFingerprint(["event:1:3", "need:2:open"])).toBe(
      demandPreviewFingerprint(["need:2:open", "event:1:3"]),
    );
    expect(demandPreviewFingerprint(["event:1:4", "need:2:open"])).not.toBe(
      demandPreviewFingerprint(["event:1:3", "need:2:open"]),
    );
  });
});
