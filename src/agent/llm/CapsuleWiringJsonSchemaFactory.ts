import type { JsonSchema } from "@angriff36/manifest/agent-sdk";
import type {
  CapsuleCommandDescriptor,
  CapsuleCommandParameter,
} from "../CapsuleCommandCatalog";

export interface CapsuleWiringSchemaOptions {
  requiresDocumentId?: boolean;
}

/**
 * Builds Draft-07 JSON Schema properties from wiring contract parameters.
 * Instance (non-createVia) mutations include required Convex docId + optional version.
 */
export class CapsuleWiringJsonSchemaFactory {
  toObjectSchemaForDescriptor(
    descriptor: CapsuleCommandDescriptor,
  ): JsonSchema {
    return this.toObjectSchema(descriptor.parameters, {
      requiresDocumentId: descriptor.requiresDocumentId,
    });
  }

  toObjectSchema(
    parameters: readonly CapsuleCommandParameter[],
    options: CapsuleWiringSchemaOptions = {},
  ): JsonSchema {
    const clientParams = parameters.filter((p) => p.ownership === "client");
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    if (options.requiresDocumentId) {
      properties.docId = {
        type: "string",
        description:
          "Convex document id for the target entity instance (mutation docId)",
      };
      required.push("docId");
      properties.version = {
        type: "number",
        description: "Optional optimistic concurrency version",
      };
    }

    for (const param of clientParams) {
      properties[param.name] = this.toPropertySchema(param);
      if (param.required) {
        required.push(param.name);
      }
    }

    properties.idempotencyKey = {
      type: "string",
      description:
        "Optional idempotency key for safe retries of the same logical write",
    };

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }

  private toPropertySchema(param: CapsuleCommandParameter): JsonSchema {
    const schema: JsonSchema = {
      type: this.resolveJsonType(param),
      description: `${param.tsType}${param.required ? "" : " (optional)"}`,
    };

    if (param.irTypeName) {
      schema["x-manifest-type"] = param.irTypeName;
    }

    const enumValues = param.constraints?.enumValues;
    if (enumValues && enumValues.length > 0) {
      schema.enum = enumValues;
      schema.type = "string";
    }

    if (typeof param.constraints?.min === "number") {
      schema.minimum = param.constraints.min;
    }
    if (typeof param.constraints?.max === "number") {
      schema.maximum = param.constraints.max;
    }
    if (param.constraints?.dateLike) {
      schema.type = "string";
      schema.format = "date-time";
    }

    return schema;
  }

  private resolveJsonType(param: CapsuleCommandParameter): string {
    if (param.tsType === "number" || param.irTypeName === "decimal") {
      return "number";
    }
    if (param.tsType === "boolean" || param.irTypeName === "boolean") {
      return "boolean";
    }
    // Manifest IR uses `list`; generated tsType is `T[]` or `Array<T>`.
    if (
      param.tsType.startsWith("Array") ||
      param.tsType.endsWith("[]") ||
      param.irTypeName === "array" ||
      param.irTypeName === "list"
    ) {
      return "array";
    }
    return "string";
  }
}
