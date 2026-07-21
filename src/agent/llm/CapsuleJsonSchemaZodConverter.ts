import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import type { JsonSchema } from "@angriff36/manifest/agent-sdk";

/**
 * Converts Draft-07 tool JSON Schema into a Zod raw shape for MCP registration.
 */
export class CapsuleJsonSchemaZodConverter {
  toZodRawShape(schema: JsonSchema): ZodRawShape {
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const shape: ZodRawShape = {};

    for (const [key, prop] of Object.entries(properties)) {
      let field = this.toZodType(prop);
      if (!required.has(key)) {
        field = field.optional();
      }
      shape[key] = field;
    }

    return shape;
  }

  private toZodType(prop: JsonSchema): ZodTypeAny {
    if (prop.enum && prop.enum.length > 0) {
      const values = prop.enum.map(String);
      const [head, ...tail] = values;
      if (!head) {
        return z.string();
      }
      return z.enum([head, ...tail] as [string, ...string[]]);
    }

    switch (prop.type) {
      case "number":
        return z.number();
      case "boolean":
        return z.boolean();
      case "array":
        return z.array(z.unknown());
      case "object":
        return z.record(z.unknown());
      default:
        return z.string();
    }
  }
}
