import { Navigate, useLocation, useParams } from "react-router-dom";
import { useGetPackList } from "../../lib/manifest-convex-react";
import { useRouteRecord } from "../../lib/routeRecord";
import { ErrorState } from "../../ui/primitives";

/**
 * An old pack list link opens that list on its event's Equipment tab, where
 * each event's pack list now lives (owner, 2026-10-14). The old query
 * (`?item=` and the like) comes along.
 */
export function PackListOnEvent() {
  const { id } = useParams();
  const { search } = useLocation();
  const packList = useRouteRecord(useGetPackList, id);
  if (packList === undefined) return null;
  if (packList === null) {
    return (
      <ErrorState
        title="Pack list not found"
        detail="This pack list is unavailable in the current workspace."
      />
    );
  }
  const query = new URLSearchParams(search);
  query.set("tab", "equipment");
  return (
    <Navigate
      to={`/events/${String(packList.eventId)}?${query.toString()}#pack-list`}
      replace
    />
  );
}
