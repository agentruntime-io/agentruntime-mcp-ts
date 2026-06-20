/**
 * Generic MCP bridge route — mirror agentruntime-mcp-go bridge.go
 */
import type http from "node:http";
import { extractToken, isSchemaEndpointForMount } from "./auth_http.js";
import { applyBridgeHeaders } from "./bridge_auth.js";
import { buildRuntimeContext, fetchControlPayload } from "./control.js";
import { ControlError, errProxyTarget, humanMessageFromControlAPIBody } from "./errors.js";
import { loadConfig } from "./runtime.js";
import { initTracingFromConfigPath, wrapWithTracing } from "./tracing.js";
import { logger } from "./logger.js";

export const BRIDGE_MOUNT_PATH = "/bridge/mcp";

type JsonRpcError = { code: number; message: string };

function jsonRpcErr(code: number, message: string): JsonRpcError {
  return { code, message };
}

function writeJsonRpcResponse(
  res: http.ServerResponse,
  id: unknown,
  result: Record<string, unknown> | null,
  rpcErr: JsonRpcError | null
): void {
  const body: Record<string, unknown> = { jsonrpc: "2.0", id: id ?? null };
  if (rpcErr) body.error = rpcErr;
  else body.result = result ?? {};
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function bridgeControlErr(err: unknown): string {
  if (err instanceof ControlError) {
    const hm = humanMessageFromControlAPIBody(err.bodyText);
    if (hm) return hm;
  }
  return err instanceof Error ? err.message : String(err);
}

function bridgeUpstreamFromPayload(bridge: Record<string, unknown> | undefined): string {
  if (!bridge) {
    throw new Error(
      "server is not configured for bridge mode (missing metadata.bridge upstream_url)"
    );
  }
  const upstream = String(bridge.upstream_url ?? "").trim();
  if (!upstream) {
    throw new Error("bridge upstream_url is not set on mcp_servers.metadata");
  }
  return upstream;
}

function toolNameFromParams(data: Record<string, unknown>): string | undefined {
  const params = data.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return undefined;
  const name = String((params as { name?: unknown }).name ?? "").trim();
  return name || undefined;
}

async function bridgePost(
  targetUrl: string,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string>
): Promise<Record<string, unknown>> {
  if (!targetUrl.trim()) throw new Error(String(errProxyTarget));

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new Error(`${String(errProxyTarget)}: ${e instanceof Error ? e.message : String(e)}`);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${String(errProxyTarget)}: target returned ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`${String(errProxyTarget)}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function bridgeHttpHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const mount = BRIDGE_MOUNT_PATH;
  if (isSchemaEndpointForMount(req, mount)) {
    const token = extractToken(req);
    const ctx = buildRuntimeContext(req);
    try {
      const payload = await fetchControlPayload(token, {}, ctx);
      const schema = payload.configSchema ?? {};
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(schema));
    } catch (err) {
      res.statusCode = 502;
      res.end(bridgeControlErr(err));
    }
    return;
  }

  if ((req.method ?? "").toUpperCase() !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const chunks: Buffer[] = [];
  for await (const ch of req) chunks.push(Buffer.from(ch));
  const raw = Buffer.concat(chunks).toString("utf8");

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    writeJsonRpcResponse(res, null, null, jsonRpcErr(-32700, "Parse error"));
    return;
  }

  const reqId = data.id;
  const method = typeof data.method === "string" ? data.method : "";

  const ctx = buildRuntimeContext(req);
  if (method === "tools/call") {
    const tn = toolNameFromParams(data);
    if (tn) ctx.tool_name = tn;
  }

  const token = extractToken(req);
  let controlPayload;
  try {
    controlPayload = await fetchControlPayload(token, {}, ctx);
  } catch (err) {
    writeJsonRpcResponse(res, reqId, null, jsonRpcErr(-32603, bridgeControlErr(err)));
    return;
  }

  let upstream: string;
  try {
    upstream = bridgeUpstreamFromPayload(controlPayload.bridge);
  } catch (err) {
    writeJsonRpcResponse(
      res,
      reqId,
      null,
      jsonRpcErr(-32603, err instanceof Error ? err.message : String(err))
    );
    return;
  }

  let authHdr: Record<string, string>;
  try {
    authHdr = applyBridgeHeaders(controlPayload.config, controlPayload.bridge);
  } catch (err) {
    writeJsonRpcResponse(
      res,
      reqId,
      null,
      jsonRpcErr(-32603, `upstream auth: ${err instanceof Error ? err.message : String(err)}`)
    );
    return;
  }

  const handleResult = async (): Promise<void> => {
    const proxied = await bridgePost(upstream, data, authHdr);
    if (method === "tools/list" || method === "tools/call") {
      const result =
        proxied.result && typeof proxied.result === "object" && !Array.isArray(proxied.result)
          ? (proxied.result as Record<string, unknown>)
          : {};
      writeJsonRpcResponse(res, reqId, result, null);
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(proxied));
  };

  try {
    await handleResult();
  } catch (err) {
    writeJsonRpcResponse(
      res,
      reqId,
      null,
      jsonRpcErr(-32603, err instanceof Error ? err.message : String(err))
    );
  }
}

/** HTTP listener for Control-registered external MCP bridges at /bridge/mcp. */
export async function handlerForBridge(configPath: string): Promise<http.RequestListener> {
  const cfg = loadConfig(configPath);
  await initTracingFromConfigPath(configPath);
  const inner: http.RequestListener = (req, res) => {
    void bridgeHttpHandler(req, res);
  };
  return wrapWithTracing(cfg, inner);
}

export async function mountBridgeRoute(
  configPath: string,
  routeHandlers: Map<string, http.RequestListener>
): Promise<void> {
  routeHandlers.set(BRIDGE_MOUNT_PATH, await handlerForBridge(configPath));
  logger.info(`MCP bridge route registered at ${BRIDGE_MOUNT_PATH}`);
}
