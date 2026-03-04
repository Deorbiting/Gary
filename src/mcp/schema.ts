/**
 * JSON Schema → Zod schema converter for MCP tool input schemas.
 *
 * Handles the common JSON Schema types used by MCP tools.
 * Falls back to z.any() for complex or unsupported schemas.
 */
import { z, type ZodTypeAny } from 'zod';

interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
}

/**
 * Convert a JSON Schema object to a Zod schema.
 * Handles common types: string, number, integer, boolean, array, object, enum.
 * Falls back to z.any() for unsupported constructs.
 */
export function jsonSchemaToZod(schema: JsonSchema): ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  // Handle enum
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum;
    if (values.every((v): v is string => typeof v === 'string')) {
      const enumSchema = z.enum(values as [string, ...string[]]);
      return schema.description ? enumSchema.describe(schema.description) : enumSchema;
    }
    return z.any().describe(schema.description ?? '');
  }

  // Handle const
  if (schema.const !== undefined) {
    return z.literal(schema.const as string | number | boolean);
  }

  // Handle anyOf/oneOf as union
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf ?? schema.oneOf)!;
    if (variants.length >= 2) {
      const zodVariants = variants.map((v) => jsonSchemaToZod(v));
      const unionSchema = z.union([zodVariants[0], zodVariants[1], ...zodVariants.slice(2)]);
      return schema.description ? unionSchema.describe(schema.description) : unionSchema;
    }
    if (variants.length === 1) {
      return jsonSchemaToZod(variants[0]);
    }
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (type) {
    case 'string': {
      let s = z.string();
      if (schema.description) s = s.describe(schema.description);
      if (schema.minLength !== undefined) s = s.min(schema.minLength);
      if (schema.maxLength !== undefined) s = s.max(schema.maxLength);
      return s;
    }

    case 'number':
    case 'integer': {
      let n = type === 'integer' ? z.number().int() : z.number();
      if (schema.description) n = n.describe(schema.description);
      if (schema.minimum !== undefined) n = n.min(schema.minimum);
      if (schema.maximum !== undefined) n = n.max(schema.maximum);
      return n;
    }

    case 'boolean': {
      const b = z.boolean();
      return schema.description ? b.describe(schema.description) : b;
    }

    case 'array': {
      const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
      const arr = z.array(itemSchema);
      return schema.description ? arr.describe(schema.description) : arr;
    }

    case 'object': {
      return convertObjectSchema(schema);
    }

    case 'null': {
      return z.null();
    }

    default: {
      // No type specified but has properties → treat as object
      if (schema.properties) {
        return convertObjectSchema(schema);
      }
      // Fallback
      const fallback = z.any();
      return schema.description ? fallback.describe(schema.description) : fallback;
    }
  }
}

/**
 * Convert an object-type JSON Schema to a Zod object schema.
 */
function convertObjectSchema(schema: JsonSchema): ZodTypeAny {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    const obj = z.record(z.string(), z.any());
    return schema.description ? obj.describe(schema.description) : obj;
  }

  const shape: Record<string, ZodTypeAny> = {};
  const required = new Set(schema.required ?? []);

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    let zodProp = jsonSchemaToZod(propSchema);
    if (!required.has(key)) {
      zodProp = zodProp.optional();
    }
    shape[key] = zodProp;
  }

  const obj = z.object(shape);
  return schema.description ? obj.describe(schema.description) : obj;
}
