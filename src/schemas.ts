/**
 * Schema utilities: Zod → JSON Schema (for input/output shapes).
 * Mirrors Python emit_json_shape, emit_flat_shape, build_schemas.
 */
import { z, type ZodType } from "zod";

/** Any Zod schema (v4). */
export type ZodSchema = ZodType;

function zodToJson(schema: ZodSchema): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-07" }) as Record<string, unknown>;
}

export function emitJsonShape(schema: ZodSchema | null | undefined): Record<string, unknown> {
  if (!schema) {
    return { properties: {} };
  }
  const json = zodToJson(schema);
  if (json.properties && typeof json.properties === "object") {
    return json;
  }
  return { properties: {} };
}

export function emitFlatShape(schema: ZodSchema | null | undefined): Record<string, unknown> {
  if (!schema) {
    return {};
  }
  const full = zodToJson(schema);
  const props = (full?.properties as Record<string, unknown>) ?? {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    const vObj = v as Record<string, unknown>;
    result[k] = {
      type: vObj?.type ?? "string",
      description: vObj?.description,
      required: (full?.required as string[] | undefined)?.includes(k) ?? false,
    };
  }
  return result;
}

export function buildSchemas(
  inSchema: ZodSchema | null | undefined,
  outSchema: ZodSchema | null | undefined
): [Record<string, unknown>, Record<string, unknown>] {
  return [emitJsonShape(inSchema), emitJsonShape(outSchema)];
}
