import { useState } from "react";
import { useDishMarkSignature } from "../../lib/manifest-convex-react";

/**
 * A house signature dish. The Company Scorecard "Menu Adoption Rate" counts
 * how many dishes served are signature dishes (target 70%+). A version of a
 * signature dish counts too.
 */
export function DishSignatureField({
  dish,
  onFailure,
}: {
  dish: { _id: string; version: number; isSignature?: boolean | null };
  onFailure: (error: unknown) => void;
}) {
  const markSignature = useDishMarkSignature();
  const [busy, setBusy] = useState(false);
  return (
    <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
      <input
        type="checkbox"
        checked={dish.isSignature === true}
        disabled={busy}
        data-testid="dish-signature"
        onChange={(e) => {
          setBusy(true);
          void markSignature({
            docId: dish._id,
            version: dish.version,
            isSignatureDish: e.currentTarget.checked,
          })
            .catch(onFailure)
            .finally(() => setBusy(false));
        }}
      />
      House signature dish
    </label>
  );
}
