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

  /**
   * The tenant the executor's identity resolves to — the same answer the
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
      venues,
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
      client.query(api.queries.listVenue, {}),
    ]);
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
