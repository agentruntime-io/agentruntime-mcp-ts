/**
 * Bridge outbound auth/header mapping — mirror agentruntime-mcp-go bridge_auth.go
 */
import type { ConfigView } from "./context.js";

export type StringMap = Record<string, unknown>;

function stringFromMap(m: StringMap | null | undefined, key: string): string {
  if (!m) return "";
  const v = m[key];
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

function configString(cfg: ConfigView | null | undefined, key: string): string {
  if (!cfg || !key) return "";
  const v = cfg[key];
  if (v == null) return "";
  return typeof v === "string" ? v.trim() : String(v).trim();
}

/** auth_mapping: { type: "none" | "bearer" | "header", from?, name? } */
export function applyAuthMapping(
  cfg: ConfigView,
  mapping: StringMap | null | undefined
): Record<string, string> {
  const h: Record<string, string> = {};
  if (!mapping) return h;

  const typ = stringFromMap(mapping, "type").toLowerCase().trim();
  if (!typ || typ === "none") return h;

  let from = stringFromMap(mapping, "from").trim();
  if (!from) from = stringFromMap(mapping, "value_from").trim();
  const val = configString(cfg, from);
  if (!val && typ !== "none") {
    throw new Error(`auth mapping requires config key ${JSON.stringify(from)}`);
  }

  switch (typ) {
    case "bearer":
      h.Authorization = `Bearer ${val}`;
      break;
    case "header": {
      const name = stringFromMap(mapping, "name").trim();
      if (!name) throw new Error("auth mapping type header requires name");
      h[name] = val;
      break;
    }
    default:
      throw new Error(`unsupported auth_mapping type ${JSON.stringify(typ)}`);
  }
  return h;
}

/** Each mapping: { name, from } or { name, value_from } */
export function applyHeaderMappings(
  cfg: ConfigView,
  mappings: Array<StringMap | null | undefined>
): Record<string, string> {
  const h: Record<string, string> = {};
  for (const m of mappings) {
    if (!m) continue;
    const name = stringFromMap(m, "name").trim();
    let from = stringFromMap(m, "from").trim();
    if (!from) from = stringFromMap(m, "value_from").trim();
    if (!name) throw new Error("header mapping requires name");
    if (!from) throw new Error(`header mapping for ${JSON.stringify(name)} requires from`);
    const val = configString(cfg, from);
    if (!val) throw new Error(`header mapping requires config key ${JSON.stringify(from)}`);
    h[name] = val;
  }
  return h;
}

function coerceHeaderMappings(raw: unknown): Array<StringMap> {
  if (!Array.isArray(raw)) return [];
  const out: Array<StringMap> = [];
  for (const item of raw) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      out.push(item as StringMap);
    }
  }
  return out;
}

/** Merge auth_mapping then header_mappings from bridge metadata. */
export function applyBridgeHeaders(
  cfg: ConfigView,
  bridge: StringMap | null | undefined
): Record<string, string> {
  const h: Record<string, string> = {};
  if (!bridge) return h;

  const authMap =
    bridge.auth_mapping && typeof bridge.auth_mapping === "object" && !Array.isArray(bridge.auth_mapping)
      ? (bridge.auth_mapping as StringMap)
      : undefined;
  Object.assign(h, applyAuthMapping(cfg, authMap));

  const headerMappings = coerceHeaderMappings(bridge.header_mappings);
  if (headerMappings.length === 0) return h;
  Object.assign(h, applyHeaderMappings(cfg, headerMappings));
  return h;
}
