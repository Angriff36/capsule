import { describe, expect, it, vi } from "vitest";
import {
  applyDishIngredientRemoval,
  dishIngredientRemovalIntent,
} from "../src/features/kitchen/dishIngredientRemoval";
import {
  ACTION_PROMPT_CONFIRM_ARM_MS,
  confirmControlMountState,
  isActionPromptConfirmArmed,
  shouldAcceptConfirmClick,
} from "../src/ui/action-prompt/confirmClickArm";
import { ActionPromptController } from "../src/ui/action-prompt/ActionPromptController";
import { ActionPromptSession } from "../src/ui/action-prompt/useActionPrompt";

describe("Keep as-is must not remove a dish ingredient", () => {
  it("cancel / Keep as-is / dismissed never call remove", async () => {
    const remove = vi.fn();
    for (const confirmed of [
      false,
      null,
      undefined,
      "dismissed",
      "Keep as-is",
      0,
      {},
    ]) {
      remove.mockClear();
      await expect(
        applyDishIngredientRemoval({ confirmed, remove }),
      ).resolves.toBe("keep");
      expect(remove, `confirmed=${String(confirmed)}`).not.toHaveBeenCalled();
      expect(dishIngredientRemovalIntent(confirmed)).toBe("keep");
    }
  });

  it("only an explicit true confirm calls remove", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    await expect(
      applyDishIngredientRemoval({ confirmed: true, remove }),
    ).resolves.toBe("remove");
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("askConfirm returns false when Keep as-is dismisses", async () => {
    const controller = new ActionPromptController();
    const announced: string[] = [];
    const prompt = new ActionPromptSession(controller, () =>
      announced.push("dismissed"),
    );
    const pending = prompt.askConfirm({
      title: "Remove ingredient",
      description: "Remove flour from this dish?",
      confirmLabel: "Remove",
      cancelLabel: "Keep as-is",
      tone: "danger",
    });
    controller.dismiss();
    await expect(pending).resolves.toBe(false);
    expect(announced).toEqual(["dismissed"]);
  });

  it("confirm is not clickable on the same tick the panel mounts", () => {
    expect(isActionPromptConfirmArmed(0)).toBe(false);
    expect(isActionPromptConfirmArmed(ACTION_PROMPT_CONFIRM_ARM_MS - 1)).toBe(
      false,
    );
    expect(shouldAcceptConfirmClick({ kind: "confirm", armed: false })).toBe(
      false,
    );
    const mount = confirmControlMountState(false);
    expect(mount.disabled).toBe(true);
    expect(mount.pointerEvents).toBe("none");
    expect(mount.acceptsClick).toBe(false);
  });

  it("confirm becomes clickable only after the arm delay", () => {
    expect(isActionPromptConfirmArmed(ACTION_PROMPT_CONFIRM_ARM_MS)).toBe(true);
    expect(shouldAcceptConfirmClick({ kind: "confirm", armed: true })).toBe(
      true,
    );
    const armed = confirmControlMountState(true);
    expect(armed.disabled).toBe(false);
    expect(armed.pointerEvents).toBe("auto");
    expect(armed.acceptsClick).toBe(true);
  });
});
