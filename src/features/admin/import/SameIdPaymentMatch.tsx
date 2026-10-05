import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../lib/api";

/**
 * Matches every waiting imported payment whose id is already on exactly one
 * Capsule payment (PR05-07). Look-alikes stay for a person to check.
 */
export function SameIdPaymentMatch({
  disabled,
  onDone,
  onError,
}: Readonly<{
  disabled: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const matchAll = useMutation(api.importPaymentMatch.matchSameIdPayments);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        void matchAll({})
          .then(({ matched, more }) =>
            onDone(
              matched === 0
                ? "No waiting payment has the same id as a Capsule payment."
                : `Matched ${matched} payment(s) with the same id.${more ? " Press again for more." : ""}`,
            ),
          )
          .catch((cause: unknown) =>
            onError(
              cause instanceof Error
                ? cause.message
                : "Couldn't match those payments.",
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Matching…" : "Match payments with the same id"}
    </button>
  );
}
