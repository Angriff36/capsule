import { EventSeamSourceReader } from "./EventSeamSourceReader";

const EVENT_ENCRYPTED_FIELDS = [
  "primaryContactName",
  "primaryContactEmail",
  "primaryContactPhone",
] as const;

/**
 * Focused proofs for one Event read (getEvent) and one Event mutation
 * (Event_changePrimaryContact) through api, getAuthContext, and encryption.
 */
export class EventSeamContract {
  private readonly sources = new EventSeamSourceReader();

  assertUiCannotSelectInternalFunctions(): void {
    const ui = this.sources.read("src/features/events/EventDetailPage.tsx");
    const hooks = this.sources.read("src/lib/manifest-convex-react.ts");
    const apiFacade = this.sources.read("src/lib/api.ts");
    for (const text of [ui, hooks, apiFacade]) {
      if (
        /\binternal\b/.test(text) &&
        /from\s+["'][^"']*_generated\/api["']/.test(text)
      ) {
        throw new Error("Client source imports Convex internal API");
      }
      if (
        text.includes("listEventsByType") ||
        text.includes("listEventsByEntity")
      ) {
        throw new Error(
          "Client source references internal Event query helpers",
        );
      }
      if (text.includes("__decryptDoc") || text.includes("__encryptDoc")) {
        throw new Error("Client source references encryption helpers");
      }
    }
  }

  assertGeneratedApiPointsAtPublicSurfaces(): void {
    const hooks = this.sources.read("src/lib/manifest-convex-react.ts");
    const queries = this.sources.read("convex/queries.ts");
    const mutations = this.sources.read("convex/mutations.ts");
    const apiTypes = this.sources.read("convex/_generated/api.d.ts");

    if (!hooks.includes("useQuery(api.queries.getEvent")) {
      throw new Error("useGetEvent must call api.queries.getEvent");
    }
    if (
      !hooks.includes("useMutation(api.mutations.Event_changePrimaryContact)")
    ) {
      throw new Error(
        "useEventChangePrimaryContact must call api.mutations.Event_changePrimaryContact",
      );
    }
    if (!hooks.includes("useMutation(api.mutations.Event_reschedule)")) {
      throw new Error(
        "useEventReschedule must call api.mutations.Event_reschedule",
      );
    }
    if (!/^export const getEvent = query\(/m.test(queries)) {
      throw new Error("getEvent must be a public query()");
    }
    if (
      !/^export const Event_changePrimaryContact = mutation\(/m.test(mutations)
    ) {
      throw new Error("Event_changePrimaryContact must be a public mutation()");
    }
    if (!/^export const listEventsByType = internalQuery\(/m.test(queries)) {
      throw new Error("listEventsByType must remain internalQuery");
    }
    if (!apiTypes.includes('FunctionReference<any, "public">')) {
      throw new Error("Generated api must filter to public FunctionReference");
    }
    if (!apiTypes.includes('FunctionReference<any, "internal">')) {
      throw new Error(
        "Generated internal api must filter to internal FunctionReference",
      );
    }
  }

  assertUiReadAndMutationWiring(): void {
    const ui = this.sources.read("src/features/events/EventDetailPage.tsx");
    if (!ui.includes("useGetEvent")) {
      throw new Error("EventDetailPage must use useGetEvent");
    }
    if (!ui.includes("useEventReschedule")) {
      throw new Error("EventDetailPage must use useEventReschedule");
    }
    if (!ui.includes('from "../../lib/manifest-convex-react"')) {
      throw new Error("EventDetailPage must import generated hooks only");
    }
    if (
      ui.includes('from "../../../convex/') ||
      ui.includes('from "../../convex/')
    ) {
      throw new Error(
        "EventDetailPage must not import Convex modules directly",
      );
    }
  }

  assertGetEventAuthBeforeDecrypt(): void {
    const queries = this.sources.read("convex/queries.ts");
    const body = this.sources.sliceBetween(
      queries,
      "export const getEvent = query({",
      "export const listEventByTenantId = query({",
    );
    const authAt = body.indexOf("getAuthContext(ctx)");
    const allowAt = body.indexOf("__allowsRead(");
    const tenantAt = body.indexOf("tenantId");
    const decryptAt = body.indexOf("__decryptDoc(");
    // Generated getEvent may return the decrypted doc or a hydrated projection.
    const returnDocAt = Math.max(
      body.lastIndexOf("return __doc"),
      body.lastIndexOf("return __hydrated"),
    );
    if (authAt < 0 || allowAt < 0 || decryptAt < 0 || returnDocAt < 0) {
      throw new Error("getEvent missing auth/decrypt/return steps");
    }
    if (!(authAt < allowAt && allowAt < decryptAt && decryptAt < returnDocAt)) {
      throw new Error(
        "getEvent must auth + authorize before decrypt and return",
      );
    }
    if (!(tenantAt > allowAt && tenantAt < decryptAt)) {
      throw new Error("getEvent must enforce tenant before decrypt");
    }
    if (!body.includes("return null")) {
      throw new Error(
        "getEvent must fail closed with null for unauthorized reads",
      );
    }
    for (const field of EVENT_ENCRYPTED_FIELDS) {
      if (!body.includes(`"${field}"`)) {
        throw new Error(`getEvent must decrypt only Event field ${field}`);
      }
    }
  }

  assertChangePrimaryContactAuthEncryptOrder(): void {
    const mutations = this.sources.read("convex/mutations.ts");
    const body = this.sources.sliceBetween(
      mutations,
      "export const Event_changePrimaryContact = mutation({",
      "export const Event_changeRequirements = mutation({",
    );
    const authAt = body.indexOf("getAuthContext(ctx)");
    const tenantAt = body.indexOf("tenantId !== __auth.tenantId");
    const roleAt = body.indexOf('checkRole(user, "eventAccess")');
    const encryptAt = body.indexOf("__encryptDoc(");
    const patchAt = body.indexOf("ctx.db.patch(");
    const returnAt = body.lastIndexOf("return {");
    if (
      authAt < 0 ||
      tenantAt < 0 ||
      roleAt < 0 ||
      encryptAt < 0 ||
      patchAt < 0 ||
      returnAt < 0
    ) {
      throw new Error("Event_changePrimaryContact missing seam steps");
    }
    if (!(authAt < tenantAt && tenantAt < roleAt && roleAt < encryptAt)) {
      throw new Error(
        "Event_changePrimaryContact must auth, tenant-check, and authorize before encrypt",
      );
    }
    if (!(encryptAt < patchAt && patchAt < returnAt)) {
      throw new Error(
        "Event_changePrimaryContact must encrypt updates before db.patch and return",
      );
    }
    for (const field of EVENT_ENCRYPTED_FIELDS) {
      if (!body.includes(`${field}:`)) {
        throw new Error(`Mutation must accept/update encrypted field ${field}`);
      }
    }
    if (body.includes("console.log") || body.includes("console.info")) {
      throw new Error("Mutation must not log (risk of plaintext leakage)");
    }
    const auditPayload = body.slice(
      body.indexOf("payload: { eventId: docId"),
      body.indexOf("createdAt: Date.now()"),
    );
    for (const field of EVENT_ENCRYPTED_FIELDS) {
      if (auditPayload.includes(field)) {
        throw new Error(`Audit payload must not include plaintext ${field}`);
      }
    }
  }

  assertHelpersNotExported(): void {
    const queries = this.sources.read("convex/queries.ts");
    const mutations = this.sources.read("convex/mutations.ts");
    if (/export\s+async\s+function\s+__decryptDoc/.test(queries)) {
      throw new Error("__decryptDoc must not be exported from queries");
    }
    if (/export\s+async\s+function\s+__encryptDoc/.test(mutations)) {
      throw new Error("__encryptDoc must not be exported from mutations");
    }
    if (/export\s+async\s+function\s+__decryptDoc/.test(mutations)) {
      throw new Error("__decryptDoc must not be exported from mutations");
    }
  }

  assertHookArgumentShapes(): void {
    const hooks = this.sources.read("src/lib/manifest-convex-react.ts");
    const getHook = this.sources.sliceBetween(
      hooks,
      "export function useGetEvent",
      "export function useEventApprove",
    );
    if (!getHook.includes("{ id: id as any }") && !getHook.includes("{ id:")) {
      throw new Error("useGetEvent must pass { id } to match getEvent args");
    }
    const ui = this.sources.read("src/features/events/EventDetailPage.tsx");
    const revisePanels = this.sources.read(
      "src/features/events/EventDetailRevisePanels.tsx",
    );
    if (!ui.includes("docId: event._id") && !revisePanels.includes("docId:")) {
      throw new Error(
        "EventDetailPage reschedule must pass docId matching mutation args",
      );
    }
    if (
      !revisePanels.includes("startsAt:") ||
      !revisePanels.includes("endsAt:")
    ) {
      throw new Error(
        "EventDetailRevisePanels reschedule must pass startsAt/endsAt",
      );
    }
    const mutation = this.sources.read("convex/mutations.ts");
    const reschedule = this.sources.sliceBetween(
      mutation,
      "export const Event_reschedule = mutation({",
      "export const Event_returnToPlanning = mutation({",
    );
    if (!reschedule.includes('docId: v.id("events")')) {
      throw new Error("Event_reschedule args must include docId");
    }
    if (!reschedule.includes("startsAt: v.number()")) {
      throw new Error("Event_reschedule args must include startsAt");
    }
  }
}
