import { useState } from "react";
import {
  useCreateOccasion,
  useCreateReferralSource,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { CatalogStandardListButton } from "../admin/CatalogStandardListButton";
import {
  OCCASION_CATALOG,
  REFERRAL_SOURCE_CATALOG,
  type StandardCatalogRow,
} from "../admin/catalogStandardOptions";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";

type ListedRow = { code: string; sortOrder?: number | null };

const LISTS = {
  occasion: { rows: OCCASION_CATALOG, capability: "eventManageAccess" },
  "referral source": {
    rows: REFERRAL_SOURCE_CATALOG,
    capability: "salesManageAccess",
  },
} as const;

/**
 * #368 item 5: an empty Occasion or Referral source list can be filled from
 * the event form itself, with the same "Add the standard list" button as
 * Admin > Catalogs. Shown only to people who may add to that list.
 */
export function EventCreateStandardList({
  singular,
  existing,
}: {
  singular: keyof typeof LISTS;
  existing: readonly ListedRow[] | undefined;
}) {
  const authStatus = useAuthStatus();
  const createOccasion = useCreateOccasion();
  const createReferralSource = useCreateReferralSource();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = LISTS[singular];
  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  if (!permissions.has(list.capability)) return null;
  const register =
    singular === "occasion" ? createOccasion : createReferralSource;

  const add = (missing: StandardCatalogRow[]) => {
    setBusy(true);
    setError(null);
    void (async () => {
      const nextOrder =
        (existing ?? []).reduce(
          (max, row) => Math.max(max, row.sortOrder ?? 0),
          -1,
        ) + 1;
      let added = 0;
      try {
        for (const [index, row] of missing.entries()) {
          await register({
            name: row.name,
            code: row.code,
            sortOrder: nextOrder + index,
            description: row.description,
          });
          added += 1;
        }
      } catch (cause) {
        setError(
          `Added ${added} of ${missing.length}. Press the button again to add the rest. ${cause instanceof Error ? cause.message : ""}`.trim(),
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <CatalogStandardListButton
        singular={singular}
        standardRows={list.rows}
        existing={existing}
        busy={busy}
        onAdd={add}
      />
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
