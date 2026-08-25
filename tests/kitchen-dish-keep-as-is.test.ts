import { readFileSync } from "node:fs";
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

const panel = readFileSync(
  "src/features/kitchen/DishIngredientsPanel.tsx",
  "utf8",
);
const promptPanel = readFileSync(
  "src/ui/action-prompt/ActionPromptPanel.tsx",
  "utf8",
);
const session = readFileSync(
  "src/ui/action-prompt/useActionPrompt.tsx",
  "utf8",
);

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

  it("panel routes remove through applyDishIngredientRemoval after askConfirm", () => {
    expect(panel).toContain("applyDishIngredientRemoval");
    expect(panel).toContain("askConfirm");
    expect(panel).toContain('title: "Remove ingredient"');
    expect(panel).toContain('cancelLabel: "Keep as-is"');
    expect(panel).toMatch(
      /const confirmed = await prompt\.askConfirm\([\s\S]*applyDishIngredientRemoval\(\{[\s\S]*confirmed,[\s\S]*remove: \(\) =>[\s\S]*removeLine\(/,
    );
    expect(panel).toContain('if (intent !== "remove") return;');
    expect(panel).not.toMatch(/askConfirm\([\s\S]{0,400}await removeLine\(/);
  });

  it("Kitchen dish ingredient line has qty + Save qty like the event-menu editor", () => {
    expect(panel).toContain("useDishIngredientAdjustQuantity");
    expect(panel).toContain("Save qty");
    expect(panel).toContain('data-testid="kitchen-dish-recipe-qty"');
    expect(panel).toContain('data-testid="kitchen-dish-recipe-unit"');
    expect(panel).toContain("onSaveQty");
  });

  it("Keep as-is is type=button dismiss and confirm-kind submit does not confirm", () => {
    expect(promptPanel).toContain('cancelLabel ?? "Keep as-is"');
    expect(promptPanel).toContain('data-testid="action-prompt-cancel"');
    expect(promptPanel).toContain("onClick={cancel}");
    expect(promptPanel).toMatch(
      /type="button"[\s\S]{0,200}action-prompt-cancel/,
    );
    expect(promptPanel).toContain('if (request.kind === "confirm") {');
    expect(promptPanel).toMatch(
      /if \(request\.kind === "confirm"\) \{\s*return;/,
    );
    expect(session).toContain('result.status !== "confirmed"');
    expect(session).toContain("return false");
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

  it("confirm button stays inert until armed (click-through lock)", () => {
    expect(promptPanel).toContain("ACTION_PROMPT_CONFIRM_ARM_MS");
    expect(promptPanel).toContain("shouldAcceptConfirmClick");
    expect(promptPanel).toContain('useState(request.kind !== "confirm")');
    expect(promptPanel).toContain("disabled={busy || !confirmArmed}");
    expect(promptPanel).toContain(
      'data-confirm-armed={confirmArmed ? "true" : "false"}',
    );
    expect(promptPanel).toContain(
      'style={{ pointerEvents: confirmArmed ? "auto" : "none" }}',
    );
    expect(promptPanel).toContain("onMouseDown={rejectUnarmedConfirm}");
    expect(promptPanel).toContain('event.key === "Escape"');
  });
});
