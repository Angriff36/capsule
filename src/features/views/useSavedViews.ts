import { useMemo } from "react";
import {
  useListSavedReportDefinition,
  useSavedReportDefinitionArchive,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useSavedViewOperations } from "../../lib/useSavedViewOperations";
import type { Id } from "../../lib/api";

// ponytail: saved list views reuse the owner-scoped SavedReportDefinition entity
// (schemaless `definition` json + soft delete + per-owner read gate) instead of a
// new Manifest entity + regen. `chartType === VIEW_MARKER` separates list views
// from saved charts; `definition.pageKey` scopes them to one list page.
// Upgrade path: promote to a dedicated SavedView entity if reports and views diverge.
const VIEW_MARKER = "list-view";

export type ReportSubjectArea =
  | "events"
  | "sales"
  | "inventory"
  | "production"
  | "workforce"
  | "logistics"
  | "finance";

export type SavedView<S> = {
  id: string;
  version: number;
  name: string;
  isDefault: boolean;
  state: S;
};

type ViewDefinition<S> = { pageKey: string; isDefault: boolean; state: S };

/**
 * Per-user saved filter/sort/column combinations for one list page, persisted in
 * Convex. Reads are owner-scoped by the SavedReportDefinition read policy, so no
 * client-side owner filtering is required. Exactly one view may be the default.
 */
export function useSavedViews<S>(
  pageKey: string,
  subjectArea: ReportSubjectArea,
) {
  const rows = useListSavedReportDefinition();
  const auth = useAuthStatus();
  const operations = useSavedViewOperations();
  const archive = useSavedReportDefinitionArchive();

  const views = useMemo<SavedView<S>[]>(() => {
    return (rows ?? [])
      .filter((r: any) => {
        const def = r.definition as ViewDefinition<S> | null;
        return (
          String(r.chartType) === VIEW_MARKER &&
          String(r.status) !== "archived" &&
          String(r.ownerId) === String(auth?.personId) &&
          def?.pageKey === pageKey
        );
      })
      .map((r: any): SavedView<S> => {
        const def = (r.definition ?? {}) as ViewDefinition<S>;
        return {
          id: String(r._id),
          version: Number(r.version ?? 0),
          name: String(r.name ?? "Untitled view"),
          isDefault: def.isDefault === true,
          state: def.state as S,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, pageKey, auth?.personId]);

  const defaultView = views.find((v) => v.isDefault) ?? null;

  async function save(name: string, state: S, makeDefault: boolean) {
    await operations.create({ pageKey, name, subjectArea, state, makeDefault });
  }

  async function setDefault(id: string) {
    const view = views.find((v) => v.id === id);
    if (!view || view.isDefault) return; // no-op avoids a version conflict on self
    await operations.setDefault({
      pageKey,
      targetId: view.id as Id<"savedReportDefinitions">,
    });
  }

  async function remove(id: string) {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    await archive({ docId: view.id, version: view.version });
  }

  return {
    ready: rows !== undefined && auth !== undefined,
    views,
    defaultView,
    save,
    setDefault,
    remove,
  };
}
