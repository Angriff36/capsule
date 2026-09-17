// AUTHOR-OWNED — not generated. Curated tool surface for the in-app assistant.
//
// The assistant gets a bounded slice of the governed command catalog (writes)
// plus a few tenant-scoped reads. It never gains a surface the UI cannot run:
// every tool call is executed in the signed-in user's own browser session
// through the SAME generated mutations/queries, so authz is identical to the UI
// (docs/generation/2026-07-17-command-api-surface-boundary.md, rule 5 — no
// separate AI authz).
//
// Bundle note: this module must stay free of Node APIs (it is bundled into a
// Convex action). It reads the wiring contract JSON directly and replicates the
// capabilityId → mutation naming rule from
// src/agent/CapsuleCapabilityMutationResolver.ts instead of importing it.
import wiringContract from "../../src/generated/manifest-wiring-contract.json";

/** Write commands the assistant may propose. Scalar-parameter commands only. */
export const ASSISTANT_WRITE_CAPABILITY_IDS: readonly string[] = [
  // Events + kitchen
  "Event.planEngagement",
  "Event.changeHeadcount",
  "Event.changeVenue",
  "Event.changePrimaryContact",
  "Event.submitForApproval",
  "Event.changeRequirements",
  "Event.updateDaySheet",
  "Event.confirmSalesLock",
  "Event.finalizeEvent",
  "EventDish.addToEvent",
  "EventDish.adjustServings",
  "EventDish.updateInstructions",
  "EventDish.remove",
  "Dish.introduce",
  "Dish.reviseDetails",
  "Dish.retire",
  "PrepTask.open",
  "PrepTask.assign",
  "PrepTask.complete",
  "PrepTask.revise",
  "PrepTask.cancel",
  "Client.register",
  "Client.changeContact",
  // Fleet + logistics
  "Vehicle.register",
  "Vehicle.reviseDetails",
  "Vehicle.updateOperationalStatus",
  "Trailer.register",
  "Trailer.reviseDetails",
  "Trailer.updateOperationalStatus",
  "VehicleFuelLog.record",
  "VehicleServiceEntry.record",
  "VehicleMaintenanceSchedule.schedule",
  "Delivery.schedule",
  "Delivery.startTransit",
  "Delivery.confirmDelivery",
  "Delivery.markFailed",
  "Delivery.cancel",
  "PackList.open",
  "PackList.startPacking",
  "PackList.markPacked",
  "PackList.markLoaded",
  "PackList.dispatch",
  "PackList.cancel",
  "PackListItem.addItem",
  "PackListItem.markPacked",
  // Equipment
  "Equipment.register",
  "Equipment.reviseDetails",
  "Equipment.updateCondition",
  "Equipment.retire",
  "EquipmentMaintenanceTask.schedule",
  "EquipmentMaintenanceTask.applyService",
  // Purchasing + vendor orders
  "PurchaseNeed.create",
  "PurchaseNeed.markOrdered",
  "PurchaseNeed.markFulfilled",
  "PurchaseNeed.reviseRequired",
  "PurchaseNeed.cancel",
  "VendorOrder.open",
  "VendorOrder.submit",
  "VendorOrder.confirm",
  "VendorOrder.markReceived",
  "VendorOrder.cancel",
  // Staffing
  "Shift.schedule",
  "Shift.reschedule",
  "Shift.start",
  "Shift.complete",
  "Shift.cancel",
  "TimeOffRequest.submit",
  "TimeOffRequest.approve",
  "TimeOffRequest.decline",
  // Reports
  "SavedReportDefinition.createDefinition",
  "SavedReportDefinition.rename",
  "SavedReportDefinition.updateDefinition",
  "SavedReportDefinition.archive",
];

/**
 * Curated commands whose mutation is the creation path (no docId). Explicit
 * map — the name rule (`Entity_createVia<Command>`, else `Entity_command`)
 * has exceptions such as PurchaseNeed.create. The
 * tests/governed-creation-mappings.test.ts fixture pins the full generated
 * set, so a name that drifts fails the gate.
 */
const CREATION_MUTATIONS: Record<string, string> = {
  "Event.planEngagement": "Event_createViaPlanEngagement",
  "EventDish.addToEvent": "EventDish_createViaAddToEvent",
  "Dish.introduce": "Dish_createViaIntroduce",
  "PrepTask.open": "PrepTask_createViaOpen",
  "Client.register": "Client_createViaRegister",
  "Vehicle.register": "Vehicle_createViaRegister",
  "Trailer.register": "Trailer_createViaRegister",
  "Delivery.schedule": "Delivery_createViaSchedule",
  "PackList.open": "PackList_createViaOpen",
  "PackListItem.addItem": "PackListItem_createViaAddItem",
  "Equipment.register": "Equipment_createViaRegister",
  "EquipmentMaintenanceTask.schedule": "EquipmentMaintenanceTask_createViaSchedule",
  "VehicleFuelLog.record": "VehicleFuelLog_createViaRecord",
  "VehicleServiceEntry.record": "VehicleServiceEntry_createViaRecord",
  "VehicleMaintenanceSchedule.schedule": "VehicleMaintenanceSchedule_createViaSchedule",
  "SavedReportDefinition.createDefinition": "SavedReportDefinition_createViaCreateDefinition",
  "VendorOrder.open": "VendorOrder_createViaOpen",
  "Shift.schedule": "Shift_createViaSchedule",
  "TimeOffRequest.submit": "TimeOffRequest_createViaSubmit",
  "PurchaseNeed.create": "PurchaseNeed_create",
};

export interface AssistantReadSpec {
  /** LLM-facing snake_case tool name. */
  toolName: string;
  /** Generated export under api.queries. */
  queryName: string;
  description: string;
  params: Array<{ name: string; type: "string" | "number"; description: string }>;
}

/**
 * Curated reads. The generated queries ignore any tenantId value passed and
 * filter by the CALLER's tenant (getAuthContext), so every read is bounded by
 * the signed-in user's own access.
 */
export const ASSISTANT_READS: readonly AssistantReadSpec[] = [
  {
    toolName: "list_events",
    queryName: "listEventByTenantId",
    description: "List events in the tenant (start here to find event IDs).",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "get_event",
    queryName: "getEvent",
    description: "Get one event by its _id from list_events results.",
    params: [{ name: "id", type: "string", description: "Event _id." }],
  },
  {
    toolName: "list_event_dishes",
    queryName: "listEventDishByEventId",
    description: "List the dishes booked on an event.",
    params: [{ name: "eventId", type: "string", description: "Event _id." }],
  },
  {
    toolName: "list_dishes",
    queryName: "listDishByTenantId",
    description: "List dishes in the tenant catalog.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "get_dish",
    queryName: "getDish",
    description: "Get one dish by its _id from list_dishes results.",
    params: [{ name: "id", type: "string", description: "Dish _id." }],
  },
  {
    toolName: "list_prep_tasks",
    queryName: "listPrepTaskByTenantId",
    description: "List prep tasks in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_event_prep_tasks",
    queryName: "listPrepTaskByEventId",
    description: "List prep tasks for one event.",
    params: [{ name: "eventId", type: "string", description: "Event _id." }],
  },
  {
    toolName: "list_clients",
    queryName: "listClientByTenantId",
    description: "List clients in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_ingredients",
    queryName: "listIngredientByTenantId",
    description: "List ingredients in the tenant catalog.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_components",
    queryName: "listComponentByTenantId",
    description: "List recipe components in the tenant catalog.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  // Fleet + logistics
  {
    toolName: "list_vehicles",
    queryName: "listVehicleByTenantId",
    description: "List vehicles in the tenant fleet.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "get_vehicle",
    queryName: "getVehicle",
    description: "Get one vehicle by its _id from list_vehicles results.",
    params: [{ name: "id", type: "string", description: "Vehicle _id." }],
  },
  {
    toolName: "list_vehicle_fuel_logs",
    queryName: "listVehicleFuelLogByVehicleId",
    description: "List fuel log entries for one vehicle.",
    params: [{ name: "vehicleId", type: "string", description: "Vehicle _id." }],
  },
  {
    toolName: "list_trailers",
    queryName: "listTrailerByTenantId",
    description: "List trailers in the tenant fleet.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_deliveries",
    queryName: "listDeliveryByTenantId",
    description: "List deliveries in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_event_deliveries",
    queryName: "listDeliveryByEventId",
    description: "List deliveries for one event.",
    params: [{ name: "eventId", type: "string", description: "Event _id." }],
  },
  {
    toolName: "list_pack_lists",
    queryName: "listPackListByTenantId",
    description: "List pack lists in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_event_pack_lists",
    queryName: "listPackListByEventId",
    description: "List pack lists for one event.",
    params: [{ name: "eventId", type: "string", description: "Event _id." }],
  },
  {
    toolName: "list_pack_list_items",
    queryName: "listPackListItemByPackListId",
    description: "List the items on one pack list.",
    params: [{ name: "packListId", type: "string", description: "Pack list _id." }],
  },
  // Equipment
  {
    toolName: "list_equipment",
    queryName: "listEquipmentByTenantId",
    description: "List equipment in the tenant inventory.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_equipment_maintenance_tasks",
    queryName: "listEquipmentMaintenanceTaskByTenantId",
    description: "List equipment maintenance tasks in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  // Purchasing + vendor orders + staffing
  {
    toolName: "list_purchase_needs",
    queryName: "listPurchaseNeedByTenantId",
    description: "List purchase needs in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_ingredient_demand",
    queryName: "listIngredientDemandByTenantId",
    description:
      "List ingredient demand rows in the tenant (source of ingredientDemandId for purchase needs).",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_vendor_orders",
    queryName: "listVendorOrderByTenantId",
    description: "List vendor orders in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_shifts",
    queryName: "listShiftByTenantId",
    description: "List shifts in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_event_shifts",
    queryName: "listShiftByEventId",
    description: "List shifts for one event.",
    params: [{ name: "eventId", type: "string", description: "Event _id." }],
  },
  {
    toolName: "list_time_off_requests",
    queryName: "listTimeOffRequestByTenantId",
    description: "List time-off requests in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_people",
    queryName: "listPersonByTenantId",
    description: "List staff people in the tenant (read-only).",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
  {
    toolName: "list_saved_report_definitions",
    queryName: "listSavedReportDefinitionByTenantId",
    description: "List saved report definitions in the tenant.",
    params: [
      { name: "tenantId", type: "string", description: "Any string; the caller's tenant is used." },
    ],
  },
];

/** How the signed-in browser session executes one tool call. */
export type AssistantToolExecution =
  | {
      kind: "mutation";
      mutationName: string;
      requiresDocumentId: boolean;
      /** Declared client parameters — anything else in the LLM's args is dropped. */
      paramNames: string[];
      /** Parameters needing ISO-string → epoch-ms coercion (generated args use float64 ms). */
      dateLikeParamNames: string[];
    }
  | { kind: "query"; queryName: string };

export interface AssistantToolDef {
  /** LLM-facing name ([A-Za-z0-9_-], ≤64 chars). */
  name: string;
  definition: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, unknown>;
        required: string[];
      };
    };
  };
  execution: AssistantToolExecution;
}

interface WiringParameter {
  name: string;
  tsType: string;
  required: boolean;
  ownership: string;
  irTypeName?: string;
  nullable?: boolean;
}

interface WiringCapability {
  capabilityId: string;
  entity: string;
  command: string;
  instanceCommand?: boolean;
  parameters: WiringParameter[];
  clientParameterNames: string[];
}

interface WiringContractFile {
  capabilities: WiringCapability[];
}

const contract = wiringContract as WiringContractFile;

/** Same rule as src/agent/CapsuleCapabilityMutationResolver.ts. */
function mutationNameForCapability(capabilityId: string): string {
  const creation = CREATION_MUTATIONS[capabilityId];
  if (creation) return creation;
  const dot = capabilityId.indexOf(".");
  const entity = capabilityId.slice(0, dot);
  const command = capabilityId.slice(dot + 1);
  return `${entity}_${command}`;
}

function capability(capabilityId: string): WiringCapability {
  const found = contract.capabilities.find((c) => c.capabilityId === capabilityId);
  if (!found) {
    throw new Error(`Wiring contract missing capability '${capabilityId}'.`);
  }
  return found;
}

/** Map a wiring tsType to a JSON-schema fragment. Falls back to string. */
function jsonSchemaType(tsType: string): Record<string, unknown> {
  const raw = tsType.trim();
  if (raw.endsWith("[]")) {
    return { type: "array", items: jsonSchemaType(raw.slice(0, -2)) };
  }
  const base = raw.replace(/\|\s*null/g, "").trim();
  const literals = [...base.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (literals.length > 0) return { type: "string", enum: literals };
  if (base === "number" || base === "float64" || base === "int64" || base === "bigint") {
    return { type: "number" };
  }
  if (base === "boolean") return { type: "boolean" };
  if (base === "string") return { type: "string" };
  // Complex type the curated commands should not have — keep the schema honest.
  return { type: "string", description: "JSON-encoded value" };
}

function isDateLike(p: WiringParameter): boolean {
  return p.irTypeName === "datetime" || p.irTypeName === "timestamp";
}

function writeToolDefs(): AssistantToolDef[] {
  return ASSISTANT_WRITE_CAPABILITY_IDS.map((capabilityId) => {
    const cap = capability(capabilityId);
    const params = cap.parameters.filter((p) => p.ownership === "client");
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const dateLikeParamNames: string[] = [];
    for (const p of params) {
      const schema: Record<string, unknown> = jsonSchemaType(p.tsType);
      if (isDateLike(p)) {
        dateLikeParamNames.push(p.name);
        schema.description = "ISO 8601 datetime or epoch milliseconds";
      }
      properties[p.name] = schema;
      if (p.required && !p.nullable) required.push(p.name);
    }
    const mutationName = mutationNameForCapability(capabilityId);
    // Creation paths take no docId — including direct-named ones such as
    // PurchaseNeed_create.
    const requiresDocumentId = !(capabilityId in CREATION_MUTATIONS);
    if (requiresDocumentId) {
      properties.docId = {
        type: "string",
        description: "Target document id (docId).",
      };
      required.push("docId");
    }
    const toolName = capabilityId.replace(".", "_");
    return {
      name: toolName,
      definition: {
        type: "function" as const,
        function: {
          name: toolName,
          description: `Capsule command ${cap.entity}.${cap.command}.`,
          parameters: { type: "object" as const, properties, required },
        },
      },
      execution: {
        kind: "mutation" as const,
        mutationName,
        requiresDocumentId,
        paramNames: params.map((p) => p.name),
        dateLikeParamNames,
      },
    };
  });
}

function readToolDefs(): AssistantToolDef[] {
  return ASSISTANT_READS.map((r) => ({
    name: r.toolName,
    definition: {
      type: "function" as const,
      function: {
        name: r.toolName,
        description: r.description,
        parameters: {
          type: "object" as const,
          properties: Object.fromEntries(
            r.params.map((p) => [p.name, { type: p.type, description: p.description }]),
          ),
          required: r.params.map((p) => p.name),
        },
      },
    },
    execution: { kind: "query" as const, queryName: r.queryName },
  }));
}

let cached: AssistantToolDef[] | null = null;

/** All curated assistant tools, in stable order (writes then reads). */
export function assistantToolDefs(): AssistantToolDef[] {
  if (cached == null) cached = [...writeToolDefs(), ...readToolDefs()];
  return cached;
}

export function executionSpecFor(toolName: string): AssistantToolExecution | null {
  return assistantToolDefs().find((t) => t.name === toolName)?.execution ?? null;
}
