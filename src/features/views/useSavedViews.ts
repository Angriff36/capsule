import { useMemo } from "react";
import {
  useCreateSavedReportDefinition,
  useListSavedReportDefinition,
  useSavedReportDefinitionArchive,
  useSavedReportDefinitionUpdateDefinition,
} from "../../lib/manifest-convex-react";

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
  const create = useCreateSavedReportDefinition();
  const update = useSavedReportDefinitionUpdateDefinition();
  const archive = useSavedReportDefinitionArchive();

  const views = useMemo<SavedView<S>[]>(() => {
    return (rows ?? [])
      .filter((r: any) => {
        const def = r.definition as ViewDefinition<S> | null;
        return (
          String(r.chartType) === VIEW_MARKER &&
          String(r.status) !== "archived" &&
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
  }, [rows, pageKey]);

  const defaultView = views.find((v) => v.isDefault) ?? null;

  // Clear isDefault on every currently-default view (usually zero or one).
  async function clearDefault() {
    for (const v of views.filter((v) => v.isDefault)) {
      await update({
        docId: v.id,
        version: v.version,
        definition: { pageKey, isDefault: false, state: v.state },
      });
    }
  }

  async function save(name: string, state: S, makeDefault: boolean) {
    if (makeDefault) await clearDefault();
    await create({
      name,
      subjectArea,
      chartType: VIEW_MARKER,
      definition: { pageKey, isDefault: makeDefault, state },
      sharingScope: "owner_only",
    });
  }

  async function setDefault(id: string) {
    const view = views.find((v) => v.id === id);
    if (!view || view.isDefault) return; // no-op avoids a version conflict on self
    await clearDefault();
    await update({
      docId: view.id,
      version: view.version,
      definition: { pageKey, isDefault: true, state: view.state },
    });
  }

  async function remove(id: string) {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    await archive({ docId: view.id, version: view.version });
  }

  return {
    ready: rows !== undefined,
    views,
    defaultView,
    save,
    setDefault,
    remove,
  };
}
