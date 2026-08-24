/**
 * Control POST /mcp/config — mirror agentruntime-mcp-go control.go
 */
import type { ConfigView } from "./context.js";
import { logger } from "./logger.js";
import { fetchControlConfigCached } from "./config_cache.js";
import { fetchControlPayload, type ControlPayload } from "./control_client.js";

export const HEADER_MCP_INSTANCE_ID = "X-MCP-Instance-Id";

/** Set by Control discover/validate probes so generic routes can resolve catalog server_id. */
export const HEADER_MCP_SERVER_ID = "X-MCP-Server-Id";

export type { ControlPayload };
export { fetchControlPayload };

export async function fetchControlConfig(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): Promise<ConfigView | null> {
  return fetchControlConfigCached(token, configSchema, runtimeContext);
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
