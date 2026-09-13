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
import type {
  CapsuleEventBundleDirectory,
  CapsuleEventBundleExistingEvent,
} from "./CapsuleEventBundleExistingState";

type QueryClient = {
  query(reference: unknown, args: Record<string, never>): Promise<unknown>;
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

  async loadDirectory(): Promise<CapsuleEventBundleDirectory> {
    const client = await this.resolveClient();
    const [
      organizations,
      people,
      vendors,
      ingredients,
      invoices,
      payments,
      proposals,
      vendorOrders,
      proposalLines,
      vendorOrderLines,
    ] = await Promise.all([
      client.query(api.queries.listOrganization, {}),
      client.query(api.queries.listPerson, {}),
      client.query(api.queries.listVendor, {}),
      client.query(api.queries.listIngredient, {}),
      client.query(api.queries.listInvoice, {}),
      client.query(api.queries.listPayment, {}),
      client.query(api.queries.listProposal, {}),
      client.query(api.queries.listVendorOrder, {}),
      client.query(api.queries.listProposalLineItem, {}),
      client.query(api.queries.listVendorOrderLine, {}),
    ]);
    return mapBundleDirectory({
      organizations,
      people,
      vendors,
      ingredients,
      invoices,
      payments,
      proposals,
      vendorOrders,
      proposalLines,
      vendorOrderLines,
    });
  }

  /**
   * Active clients, venues and dishes as name candidates, so a bundle for a
   * client, venue or dish already in Capsule reuses the record (exact
   * normalized name or, for clients, email) instead of registering a twin.
   */
  async loadCatalogCandidates(): Promise<CatalogCandidates> {
    const client = await this.resolveClient();
    const [clients, venues, dishes] = await Promise.all([
      client.query(api.queries.listClient, {}),
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

  async loadExisting(
    eventId: string,
  ): Promise<CapsuleEventBundleExistingEvent> {
    const client = await this.resolveClient();
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
      client.query(api.queries.listEvent, {}),
      client.query(api.queries.listClient, {}),
      client.query(api.queries.listClientContact, {}),
      client.query(api.queries.listEventDish, {}),
      client.query(api.queries.listDish, {}),
      client.query(api.queries.listEventTimelineActivity, {}),
      client.query(api.queries.listPrepTask, {}),
      client.query(api.queries.listPackList, {}),
      client.query(api.queries.listPackListItem, {}),
      client.query(api.queries.listEventAssignment, {}),
    ]);
    const event = rows(events).find((row) => String(row._id) === eventId);
    if (!event) {
      throw new Error(`Event ${eventId} was not found in this tenant.`);
    }
    const clientId = String(event.clientId);
    const clientRow = rows(clients).find((row) => String(row._id) === clientId);
    const dishNames = new Map(
      rows(dishes).map((row) => [String(row._id), text(row.name)]),
    );
    const forEvent = (row: Row) => live(row) && String(row.eventId) === eventId;
    const eventDishRows = rows(eventDishes).filter(forEvent);
    const dishNameByEventDish = new Map(
      eventDishRows.map((row) => [
        String(row._id),
        dishNames.get(String(row.dishId)) ?? "",
      ]),
    );
    const packList = rows(packLists).find(forEvent);

    return {
      eventId,
      clientId,
      venueId: event.venueId == null ? undefined : String(event.venueId),
      event: {
        quotedPrice: Number(event.quotedPrice ?? 0),
        primaryContactName: text(event.primaryContactName) || undefined,
        primaryContactEmail: event.primaryContactEmail as
          string | null | undefined,
        primaryContactPhone: event.primaryContactPhone as
          string | null | undefined,
        serviceRequirements: event.serviceRequirements as
          string | null | undefined,
        operationalRequirements: event.operationalRequirements as
          string | null | undefined,
      },
      client: {
        email: clientRow?.email as string | null | undefined,
        phone: clientRow?.phone as string | null | undefined,
      },
      clientContactNames: rows(clientContacts)
        .filter((row) => live(row) && String(row.clientId) === clientId)
        .map((row) => `${text(row.givenName)} ${text(row.familyName)}`.trim()),
      eventDishes: eventDishRows.map((row) => ({
        id: String(row._id),
        dishName: dishNames.get(String(row.dishId)) ?? "",
        course: row.course as string | null | undefined,
      })),
      timelineNames: rows(timeline)
        .filter(forEvent)
        .map((row) => text(row.name)),
      prepTasks: rows(prepTasks)
        .filter(forEvent)
        .map((row) => ({
          dishName: dishNameByEventDish.get(String(row.eventDishId)) ?? "",
          name: text(row.name),
        })),
      packList: packList
        ? {
            id: String(packList._id),
            itemDescriptions: rows(packListItems)
              .filter(
                (row) =>
                  live(row) && String(row.packListId) === String(packList._id),
              )
              .map((row) => text(row.description)),
          }
        : undefined,
      assignedPersonIds: rows(assignments)
        .filter(forEvent)
        .map((row) => String(row.personId)),
    };
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
