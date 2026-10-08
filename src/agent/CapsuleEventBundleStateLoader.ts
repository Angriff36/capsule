import { ConvexHttpClient } from "convex/browser";
import { api } from "../lib/api";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";
import type { CatalogCandidates } from "./CapsuleEventBundleCatalogMatch";
import {
  directoryRows,
  liveRow,
  mapBundleDirectory,
  rowText,
  type BundleDirectoryRow,
} from "./CapsuleEventBundleDirectoryMapper";
import { mapBundleExistingEvent } from "./CapsuleEventBundleExistingEventMapper";
import type {
  CapsuleEventBundleDirectory,
  CapsuleEventBundleExistingEvent,
} from "./CapsuleEventBundleExistingState";

type QueryClient = {
  query(reference: unknown, args: Record<string, string>): Promise<unknown>;
  setAuth?: (token: string) => void;
};

type Row = BundleDirectoryRow;
const rows = directoryRows;
const live = liveRow;
const text = rowText;

/**
 * Reads the tenant records the bundle planners match against, with the same
 * generated queries the UI uses. Live path remints the JWT on every load.
 */
export class CapsuleEventBundleStateLoader {
  private readonly injectedClient: QueryClient | null;
  private liveClient: ConvexHttpClient | null = null;

  constructor(
    client?: QueryClient,
    private readonly auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
  ) {
    this.injectedClient = client ?? null;
  }

  /**
   * The bundle's own invoice, payments, proposal and vendor orders (found by
   * the bundle's number, `identity`, and the event it attaches to), not the
   * company's whole history of each.
   */
  async loadDirectory(
    identity: string,
    eventId?: string,
  ): Promise<CapsuleEventBundleDirectory> {
    const client = await this.resolveClient();
    const [organizations, people, vendors, ingredients, records] =
      await Promise.all([
        client.query(api.queries.listOrganization, {}),
        client.query(api.queries.listPerson, {}),
        client.query(api.queries.listVendor, {}),
        client.query(api.queries.listIngredient, {}),
        client.query(
          api.agentHistoryWindow.bundleDirectory,
          eventId === undefined ? { identity } : { identity, eventId },
        ) as Promise<Partial<Record<string, unknown>> | null>,
      ]);
    return mapBundleDirectory({
      organizations,
      people,
      vendors,
      ingredients,
      invoices: records?.invoices,
      payments: records?.payments,
      proposals: records?.proposals,
      vendorOrders: records?.vendorOrders,
      proposalLines: records?.proposalLines,
      vendorOrderLines: records?.vendorOrderLines,
    });
  }

  /**
   * Active clients, venues and dishes as name candidates, so a bundle for a
   * client, venue or dish already in Capsule reuses the record (exact
   * normalized name or, for clients, email) instead of registering a twin.
   * Clients come from the list that opens only email and phone: the full
   * client list opens ten locked fields per client and runs past the server's
   * time limit on a large client book.
   */
  async loadCatalogCandidates(): Promise<CatalogCandidates> {
    const client = await this.resolveClient();
    const [clients, venues, dishes] = await Promise.all([
      client.query(api.clientDirectory.listWithContacts, {}),
      client.query(api.queries.listVenue, {}),
      client.query(api.queries.listDish, {}),
    ]);
    const active = (row: Row) => live(row) && row.status === "active";
    return {
      clients: rows(clients)
        .filter(active)
        .map((row) => ({
          id: String(row._id),
          name:
            text(row.companyName) ||
            `${text(row.givenName)} ${text(row.familyName)}`.trim(),
          aliases: [text(row.email)].filter((alias) => alias.length > 0),
        })),
      venues: rows(venues)
        .filter(active)
        .map((row) => ({ id: String(row._id), name: text(row.name) })),
      dishes: rows(dishes)
        .filter(live)
        .map((row) => ({ id: String(row._id), name: text(row.name) })),
    };
  }

  /**
   * The tenant the executor's identity resolves to â€” the same answer the
   * UI's AuthGate reads. It pins the bundle's idempotency scope; an identity
   * with no tenant cannot enter a bundle.
   */
  async loadTenantId(): Promise<string> {
    const client = await this.resolveClient();
    const status = (await client.query(api.authStatus.getAuthStatus, {})) as {
      tenantId?: string | null;
    } | null;
    const tenantId = status?.tenantId?.trim() ?? "";
    if (tenantId.length === 0) {
      throw new Error(
        "This sign-in is not linked to an organization, so no bundle can be entered for it.",
      );
    }
    return tenantId;
  }

  async loadExisting(
    eventId: string,
  ): Promise<CapsuleEventBundleExistingEvent> {
    const client = await this.resolveClient();
    // Only this event and its own rows are read: its client (for email and
    // phone) and that client's contacts, its dishes, timeline, prep tasks,
    // pack lists and their items, and its staff — not the company's whole
    // history of each. Dishes and venues are the menu and venue books.
    const event = await client.query(api.queries.getEvent, { id: eventId });
    const events = event ? [event] : [];
    const clientId =
      event && typeof event === "object" && "clientId" in event
        ? String((event as Row).clientId ?? "")
        : "";
    const [
      clients,
      clientContacts,
      eventDishes,
      dishes,
      timeline,
      prepTasks,
      packLists,
      assignments,
      venues,
    ] = await Promise.all([
      clientId
        ? client
            .query(api.queries.getClient, { id: clientId })
            .then((row) => (row ? [row] : []))
        : [],
      clientId
        ? client.query(api.queries.listClientContactByClientId, { clientId })
        : [],
      client.query(api.queries.listEventDishByEventId, { eventId }),
      client.query(api.queries.listDish, {}),
      client.query(api.queries.listEventTimelineActivityByEventId, { eventId }),
      client.query(api.queries.listPrepTaskByEventId, { eventId }),
      client.query(api.queries.listPackListByEventId, { eventId }),
      client.query(api.queries.listEventAssignmentByEventId, { eventId }),
      client.query(api.queries.listVenue, {}),
    ]);
    const packListItems = (
      await Promise.all(
        rows(packLists)
          .filter(live)
          .map((list) =>
            client.query(api.queries.listPackListItemByPackListId, {
              packListId: String(list._id),
            }),
          ),
      )
    ).flatMap(rows);
    return mapBundleExistingEvent(eventId, {
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
      venues,
    });
  }

  private async resolveClient(): Promise<QueryClient> {
    if (this.injectedClient) return this.injectedClient;
    if (!this.liveClient) {
      this.liveClient = new ConvexHttpClient(this.auth.resolveConvexUrl());
    }
    this.liveClient.setAuth(await this.auth.resolveJwt());
    return this.liveClient as unknown as QueryClient;
  }
}
