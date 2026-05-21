/**
 * Control POST /mcp/config client — mirror agentruntime-mcp-go control.go
 */
import { ControlError, errControlConfig } from "./errors.js";
import type { ConfigView } from "./context.js";
import { logger } from "./logger.js";

export const HEADER_MCP_INSTANCE_ID = "X-MCP-Instance-Id";

export async function fetchControlConfig(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): Promise<ConfigView | null> {
  const base = (process.env.MCP_CONTROL_SERVER_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;

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

  const c = data.config;
  if (c && typeof c === "object" && !Array.isArray(c)) return c as ConfigView;
  const d = data.data;
  if (d && typeof d === "object" && !Array.isArray(d)) return d as ConfigView;
  return data as ConfigView;
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

  const sid = (process.env.MCP_SERVER_ID ?? "").trim();
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
