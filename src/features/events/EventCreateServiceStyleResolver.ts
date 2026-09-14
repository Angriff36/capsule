import {
  persistableServiceStyleId,
  SERVICE_STYLE_CATALOG,
  type ServiceStyleCatalogRow,
} from "./serviceStyleCatalog";

export type ListedServiceStyleRow = {
  _id: string;
  name: string;
  code?: string;
  status?: string;
  deletedAt?: number | null;
};

export type RegisterServiceStyle = (args: {
  name: string;
  code: string;
  sortOrder?: number;
  description?: string;
}) => Promise<unknown>;

/**
 * Built-in picker values are catalog codes, not Convex ids. Saving one as
 * serviceStyleId used to drop the pick (#368). Register the missing row, then
 * return its id.
 */
export class EventCreateServiceStyleResolver {
  constructor(private readonly register: RegisterServiceStyle) {}

  static liveId(
    selected: string,
    rows: readonly ListedServiceStyleRow[] | undefined,
  ): string {
    const trimmed = selected.trim();
    if (!trimmed) return "";
    const persistable = persistableServiceStyleId(trimmed);
    if (persistable) return persistable;
    const match = (rows ?? []).find(
      (row) =>
        row.code === trimmed &&
        row.status === "active" &&
        row.deletedAt == null,
    );
    return match?._id ?? "";
  }

  missing(
    rows: readonly ListedServiceStyleRow[] | undefined,
  ): ServiceStyleCatalogRow[] {
    const have = new Set(
      (rows ?? [])
        .filter((row) => row.deletedAt == null)
        .map((row) => row.code)
        .filter((code): code is string => Boolean(code)),
    );
    return SERVICE_STYLE_CATALOG.filter((row) => !have.has(row.code));
  }

  async resolve(
    selected: string,
    rows: readonly ListedServiceStyleRow[] | undefined,
  ): Promise<string> {
    const live = EventCreateServiceStyleResolver.liveId(selected, rows);
    if (live) return live;
    const catalog = SERVICE_STYLE_CATALOG.find(
      (row) => row.code === selected.trim(),
    );
    if (!catalog) return "";
    const created = await this.register({
      name: catalog.name,
      code: catalog.code,
      description: catalog.description,
      sortOrder: SERVICE_STYLE_CATALOG.indexOf(catalog),
    });
    return createdDocId(created);
  }

  async registerMissing(
    rows: readonly ListedServiceStyleRow[] | undefined,
  ): Promise<number> {
    const missing = this.missing(rows);
    for (const [index, row] of missing.entries()) {
      await this.register({
        name: row.name,
        code: row.code,
        description: row.description,
        sortOrder: SERVICE_STYLE_CATALOG.length + index,
      });
    }
    return missing.length;
  }
}

function createdDocId(result: unknown): string {
  if (typeof result === "string" && result.trim()) return result;
  if (result && typeof result === "object" && "docId" in result) {
    const id = (result as { docId: unknown }).docId;
    return typeof id === "string" ? id : "";
  }
  return "";
}
