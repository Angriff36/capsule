/**
 * Convex document ids are opaque lowercase base32 strings. Generated
 * get-by-id queries validate their argument with v.id(table) and THROW on a
 * malformed id, so a raw URL param must never reach them unchecked — a stale
 * or mistyped link (/events/does-not-exist) would crash the screen instead
 * of rendering the page's own not-found state. This is a plausibility gate
 * only; the server stays the authority on existence, tenancy, and access.
 */
const CONVEX_ID_SHAPE = /^[0-9a-z]{25,40}$/;

export function isPlausibleConvexId(
  value: string | undefined,
): value is string {
  return value != null && CONVEX_ID_SHAPE.test(value);
}

type RecordQueryHook<Doc> = (id: string | "skip") => Doc | null | undefined;

/**
 * Resolves a route :id param through a generated useGetX hook.
 * Implausible ids never reach the server: the query is skipped and the
 * result resolves as null, so the page's existing "unavailable" UI renders
 * instead of crashing (thrown ArgumentValidationError) or loading forever
 * (a bare "skip" stays undefined).
 */
export function useRouteRecord<Doc>(
  useRecordQuery: RecordQueryHook<Doc>,
  param: string | undefined,
): Doc | null | undefined {
  const plausible = isPlausibleConvexId(param);
  const record = useRecordQuery(plausible ? param : "skip");
  return plausible ? record : null;
}
