import { useConvex } from "convex/react";
import { api } from "./api";
import type { BundleExistingEventRows } from "../agent/CapsuleEventBundleExistingEventMapper";

/**
 * One read of the rows that describe an event already in Capsule, taken at
 * the moment a BEO is imported onto it. A one-time read on purpose: these are
 * whole-tenant lists, and the import page must not subscribe to all of them
 * while a person only looks at a preview.
 */
export function useLoadExistingEventRows(): () => Promise<BundleExistingEventRows> {
  const client = useConvex();
  return async () => {
    const q = api.queries;
    const [
      events,
      clients,
      clientContacts,
      eventDishes,
      dishes,
      timeline,
      prepTasks,
      packLists,
      packListItems,
      assignments,
    ] = await Promise.all([
      client.query(q.listEvent, {}),
      client.query(q.listClient, {}),
      client.query(q.listClientContact, {}),
      client.query(q.listEventDish, {}),
      client.query(q.listDish, {}),
      client.query(q.listEventTimelineActivity, {}),
      client.query(q.listPrepTask, {}),
      client.query(q.listPackList, {}),
      client.query(q.listPackListItem, {}),
      client.query(q.listEventAssignment, {}),
    ]);
    return {
      events,
      clients,
      clientContacts,
      eventDishes,
      dishes,
      timeline,
      prepTasks,
      packLists,
      packListItems,
      assignments,
    };
  };
}
