/**
 * Env overrides keyed by schema keys — mirror agentruntime-mcp-go env_config.go
 */
import type { ConfigView } from "./context.js";

export function newLowercaseEnvIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const kv of Object.entries(process.env)) {
    const [name, val] = kv;
    if (!name || val === undefined) continue;
    if (!String(val).trim()) continue;
    idx.set(name.toLowerCase(), String(val).trim());
  }
  return idx;
}

export function lookupSchemaEnv(idx: Map<string, string>, schemaKey: string): string | undefined {
  const k = schemaKey.toLowerCase();
  let v = idx.get(k);
  if (v !== undefined) return v.trim();
  v = idx.get(("AR_" + schemaKey).toLowerCase());
  return v?.trim();
}

export function envOverridesFromSchema(schema: Record<string, unknown>, idx: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of Object.keys(schema)) {
    const v = lookupSchemaEnv(idx, k);
    if (v !== undefined && v !== "") out.set(k, v);
  }
  return out;
}

export function valueAsString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

export function requiredConfigSatisfied(schema: Record<string, unknown>, cfg: ConfigView): boolean {
  if (Object.keys(schema).length === 0) return true;
  for (const [key, def] of Object.entries(schema)) {
    if (!def || typeof def !== "object") continue;
    const meta = def as Record<string, unknown>;
    if (!meta.required) continue;
    if (valueAsString(cfg[key]) !== "") continue;
    if ("default" in meta) continue;
    return false;
  }
  return true;
}

export function envAloneSatisfiesRequired(schema: Record<string, unknown>, idx: Map<string, string>): boolean {
  const envOnly: ConfigView = {};
  for (const k of Object.keys(schema)) {
    const v = lookupSchemaEnv(idx, k);
    if (v !== undefined && v !== "") envOnly[k] = v;
  }
  return requiredConfigSatisfied(schema, envOnly);
}

export function mergeControlWithEnvPriority(
  control: ConfigView,
  envKeys: Map<string, string>,
  schema: Record<string, unknown>
): ConfigView {
  const final: ConfigView = { ...control };
  for (const k of Object.keys(schema)) {
    const v = envKeys.get(k);
    if (v !== undefined) final[k] = v;
  }
  return final;
}
