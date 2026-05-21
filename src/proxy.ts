/**
 * MCP Proxy - forwards to another MCP server with optional overlay.
 * Eager tools/list: returns target's tools directly in tools/list (merged with overlay).
 * tools/call is forwarded to target for any tool name.
 */
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import yaml from "js-yaml";
import { errProxyTarget } from "./errors.js";

function loadOverlay(overlayFile: string | null): Record<string, unknown> {
  if (!overlayFile) return {};
  try {
    const resolved = path.isAbsolute(overlayFile) ? overlayFile : path.join(process.cwd(), overlayFile);
    const raw = fs.readFileSync(resolved, "utf-8");
    return (yaml.load(raw) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

async function post(
  targetUrl: string,
  payload: Record<string, unknown>,
  bearerToken: string | null
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function fetchAndMergeTools(
  targetUrl: string,
  overlayFile: string | null,
  bearerToken: string | null
): Promise<Record<string, unknown>[]> {
  if (!targetUrl) return [];
  const res = await post(
    targetUrl,
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    bearerToken
  );
  const tools = (res?.result as Record<string, unknown>)?.tools as Record<string, unknown>[] ?? [];
  const overlay = loadOverlay(overlayFile);
  const ovMap = new Map(
    ((overlay?.tools as Record<string, unknown>[]) ?? []).map((t) => [t?.name, t])
  );
  return tools.map((t) => {
    const name = t?.name as string;
    const o = ovMap.get(name) as Record<string, unknown> | undefined;
    if (!o) return t;
    const mt = { ...t };
    if (o.description) mt.description = o.description;
    if (o.inputSchema) mt.inputSchema = o.inputSchema;
    if (o.outputSchema) mt.outputSchema = o.outputSchema;
    return mt;
  });
}

function writeJsonRpcResponse(
  res: http.ServerResponse,
  id: unknown,
  result?: Record<string, unknown>,
  error?: { code: number; message: string }
): void {
  res.setHeader("Content-Type", "application/json");
  const body = error
    ? { jsonrpc: "2.0", id, error }
    : { jsonrpc: "2.0", id, result: result ?? {} };
  res.end(JSON.stringify(body));
}

export function buildProxyApp(
  _targetUrl: string,
  _overlayFile: string | null = null,
  _bearerToken: string | null = null
): { targetUrl: string; overlayFile: string | null; bearerToken: string | null } {
  return {
    targetUrl: _targetUrl,
    overlayFile: _overlayFile,
    bearerToken: _bearerToken,
  };
}

export async function runProxy(
  targetUrl: string,
  overlayFile: string | null = null,
  bearerToken: string | null = null,
  host: string = "127.0.0.1",
  port: number = 8010
): Promise<void> {
  if (!targetUrl.trim()) {
    throw new Error(errProxyTarget);
  }
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url && req.url.startsWith("/mcp/config/schema")) {
      res.setHeader("Content-Type", "application/json");
      res.end("{}");
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      writeJsonRpcResponse(res, null, undefined, { code: -32700, message: "Parse error" });
      return;
    }

    const method = data.method as string | undefined;
    const reqId = data.id;

    if (method === "tools/list") {
      try {
        const merged = await fetchAndMergeTools(targetUrl, overlayFile, bearerToken);
        writeJsonRpcResponse(res, reqId, { tools: merged });
      } catch (e) {
        writeJsonRpcResponse(res, reqId, undefined, {
          code: -32603,
          message: e instanceof Error ? e.message : String(e),
        });
      }
      return;
    }

    if (method === "tools/call") {
      const params = (data.params as Record<string, unknown>) ?? {};
      const name = params.name as string;
      const args = (params.arguments as Record<string, unknown>) ?? {};
      if (!targetUrl) {
        writeJsonRpcResponse(res, reqId, undefined, {
          code: -32600,
          message: String(errProxyTarget),
        });
        return;
      }
      try {
        const targetRes = await post(
          targetUrl,
          { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
          bearerToken
        );
        const result = (targetRes?.result as Record<string, unknown>) ?? {};
        writeJsonRpcResponse(res, reqId, result);
      } catch (e) {
        writeJsonRpcResponse(res, reqId, undefined, {
          code: -32603,
          message: e instanceof Error ? e.message : String(e),
        });
      }
      return;
    }

    // Forward all other methods (initialize, notifications/initialized, etc.) to target
    try {
      const targetRes = await post(targetUrl, data, bearerToken);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(targetRes));
    } catch (e) {
      writeJsonRpcResponse(res, reqId, undefined, {
        code: -32603,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`MCP proxy listening on ${host}:${port} -> ${targetUrl}`);
      resolve();
    });
    server.on("error", reject);
  });
}
