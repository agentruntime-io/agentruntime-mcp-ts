/**
 * Control POST /mcp/config client — mirror agentruntime-mcp-go control.go
 */
import { ControlError, errControlConfig } from "./errors.js";
import type { ConfigView } from "./context.js";
import { logger } from "./logger.js";

export const HEADER_MCP_INSTANCE_ID = "X-MCP-Instance-Id";

/** Set by Control discover/validate probes so generic routes can resolve catalog server_id. */
export const HEADER_MCP_SERVER_ID = "X-MCP-Server-Id";

export interface ControlPayload {
  config: ConfigView;
  configSchema: Record<string, unknown>;
  bridge?: Record<string, unknown>;
}

export async function fetchControlPayload(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): Promise<ControlPayload> {
  const base = (process.env.MCP_CONTROL_SERVER_URL ?? "").trim().replace(/\/$/, "");
  if (!base) {
    return { config: {}, configSchema: {} };
  }

  let timeoutSec = 5;
  const ts = process.env.MCP_CONTROL_TIMEOUT_SEC?.trim();
  if (ts) {
    const n = parseInt(ts, 10);
    if (!Number.isNaN(n) && n > 0) timeoutSec = n;
  }

  const payload = {
    configSchema,
    config_schema: configSchema,
    schema: configSchema,
    runtimeContext,
    runtime_context: runtimeContext,
  };

  let res: Response;
  try {
    res = await fetch(`${base}/mcp/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutSec * 1000),
    });
  } catch (e) {
    throw new Error(`${String(errControlConfig)}: ${e instanceof Error ? e.message : String(e)}`);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw new ControlError(res.status, bodyText);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    throw new ControlError(502, `${String(errControlConfig)}: invalid response`);
  }

  const out: ControlPayload = { config: {}, configSchema: {} };
  const c = data.config;
  if (c && typeof c === "object" && !Array.isArray(c)) out.config = c as ConfigView;
  const cs = data.config_schema;
  if (cs && typeof cs === "object" && !Array.isArray(cs)) {
    out.configSchema = cs as Record<string, unknown>;
  }
  const b = data.bridge;
  if (b && typeof b === "object" && !Array.isArray(b)) {
    out.bridge = b as Record<string, unknown>;
  }
  return out;
}

export async function fetchControlConfig(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): Promise<ConfigView | null> {
  const p = await fetchControlPayload(token, configSchema, runtimeContext);
  return p.config ?? {};
}

interface HeadersCarrier {
  headers?: httpLikeHeaders;
}

type httpLikeHeaders = Record<string, string | string[] | undefined>;

function headerFirst(headers: httpLikeHeaders | undefined, name: string): string {
  if (!headers) return "";
  const v = headers[name.toLowerCase()];
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return typeof v === "string" ? v.trim() : "";
}

export function buildRuntimeContext(req: HeadersCarrier): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  const hdrs = req.headers as httpLikeHeaders | undefined;

  const inst = headerFirst(hdrs, "x-mcp-instance-id");
  if (inst) ctx.instance_id = inst;

  let sid = headerFirst(hdrs, "x-mcp-server-id");
  const envSid = (process.env.MCP_SERVER_ID ?? "").trim();
  if (envSid) sid = envSid;
  if (sid) ctx.server_id = sid;

  let tn = headerFirst(hdrs, "x-tool-name");
  if (!tn) tn = headerFirst(hdrs, "x-mcp-tool-name");
  ctx.tool_name = tn || "__initialize";

  return ctx;
}

export function logRuntimeContextSummary(
  path: string,
  ctx: Record<string, unknown>,
  needConfig: boolean,
  headerLen: number
): void {
  const hasInst = "instance_id" in ctx;
  const hasSrv = "server_id" in ctx;
  const tn = typeof ctx.tool_name === "string" ? ctx.tool_name : "";
  if (needConfig && !hasInst && !hasSrv) {
    logger.warn(
      `mcp control config: missing instance_id and server_id in runtime_context (path=${path} tool_name=${tn}); send header ${HEADER_MCP_INSTANCE_ID} or set MCP_SERVER_ID env`
    );
  }
  logger.debug(
    `mcp control config: path=${path} needConfig=${needConfig} instance_id_set=${hasInst} server_id_set=${hasSrv} tool_name=${JSON.stringify(tn)} ${HEADER_MCP_INSTANCE_ID}_len=${headerLen}`
  );
}
