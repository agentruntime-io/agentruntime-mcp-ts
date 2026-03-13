/**
 * Schema utilities: Zod → JSON Schema (for input/output shapes).
 * Mirrors Python emit_json_shape, emit_flat_shape, build_schemas.
 */
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type ZodSchema = z.ZodType;

export function emitJsonShape(schema: ZodSchema | null | undefined): Record<string, unknown> {
  if (!schema) {
    return { properties: {} };
  }
  const json = zodToJsonSchema(schema, { $refStrategy: "none" });
  return (json as Record<string, unknown>) ?? { properties: {} };
}

export function emitFlatShape(schema: ZodSchema | null | undefined): Record<string, unknown> {
  if (!schema) {
    return {};
  }
  const full = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;
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
