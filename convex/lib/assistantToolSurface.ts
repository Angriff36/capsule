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
  "Event.planEngagement",
  "Event.changeHeadcount",
  "Event.changeVenue",
  "Event.changePrimaryContact",
  "Event.submitForApproval",
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
];

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
  const dot = capabilityId.indexOf(".");
  const entity = capabilityId.slice(0, dot);
  const command = capabilityId.slice(dot + 1);
  const pascal = command[0]!.toUpperCase() + command.slice(1);
  // Created rows have no docId yet; every other command acts on docId.
  const isCreate = command === "planEngagement" || command === "addToEvent" ||
    command === "introduce" || command === "open" || command === "register";
  return isCreate ? `${entity}_createVia${pascal}` : `${entity}_${command}`;
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
    const requiresDocumentId = !mutationName.includes("createVia");
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
