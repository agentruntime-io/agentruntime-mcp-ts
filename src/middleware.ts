/**
 * Auth and control config resolution.
 * TypeScript equivalent of Python middleware - implemented via FastMCP authenticate + getApp() Hono middleware.
 */
import * as crypto from "crypto";
import * as http from "http";
import type { ConfigView } from "./context.js";
import { logger } from "./logger.js";

const CONTROL_TIMEOUT_MS = (parseFloat(process.env.MCP_CONTROL_TIMEOUT_SEC ?? "5") || 5) * 1000;
const CONTROL_BASE = (process.env.MCP_CONTROL_SERVER_URL ?? "").trim();
const CONFIG_REQUIRED = (process.env.MCP_CONFIG_FETCH_REQUIRED ?? "true").toLowerCase() === "true";
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";
const AUTH_MODE = process.env.MCP_AUTH_MODE ?? "token";
const HMAC_KEY_ID = process.env.MCP_HMAC_KEY_ID ?? "";
const HMAC_SECRET = process.env.MCP_HMAC_SECRET ?? "";

export function extractToken(request: http.IncomingMessage): string | null {
  const auth = request.headers?.authorization;
  if (auth && typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    return t || null;
  }
  const xToken = request.headers?.["x-mcp-token"];
  if (typeof xToken === "string" && xToken.trim()) {
    return xToken.trim();
  }
  return null;
}

export function isSchemaEndpoint(request: http.IncomingMessage): boolean {
  const method = (request.method ?? "").toUpperCase();
  const url = request.url ?? "";
  const path = url.split("?")[0] ?? "";
  return method === "GET" && path === "/mcp/config/schema";
}

async function fetchControlConfig(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): Promise<ConfigView> {
  const url = `${CONTROL_BASE.replace(/\/$/, "")}/mcp/config`;
  const payload = {
    configSchema,
    config_schema: configSchema,
    schema: configSchema,
    runtimeContext,
    runtime_context: runtimeContext,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error(`control config fetch failed: ${res.status} ${body}`);
    throw new Error(`control server returned ${res.status}: ${body}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  if (data?.config && typeof data.config === "object") {
    return data.config as ConfigView;
  }
  if (data?.data && typeof data.data === "object") {
    return data.data as ConfigView;
  }
  return (data as ConfigView) ?? {};
}

function buildRuntimeContext(request: http.IncomingMessage): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  const serverId = process.env.MCP_SERVER_ID?.trim();
  if (serverId) ctx.server_id = serverId;
  const toolName = request.headers?.["x-tool-name"] ?? request.headers?.["x-mcp-tool-name"];
  if (typeof toolName === "string" && toolName.trim()) {
    ctx.tool_name = toolName.trim();
  } else {
    ctx.tool_name = "__initialize";
  }
  return ctx;
}

/**
 * Creates FastMCP authenticate function that:
 * - Validates token (if MCP_AUTH_TOKEN set) or HMAC (if MCP_HMAC_* set)
 * - Fetches control config and attaches to session
 * - When auth mode is "none" or no token/secret configured, allows through with empty config
 */
export function createAuthenticate(configSchema: Record<string, unknown>) {
  return async (request: http.IncomingMessage): Promise<{ config: ConfigView }> => {
    if (isSchemaEndpoint(request)) {
      logger.debug("serving schema endpoint");
      return { config: {} };
    }

    const token = extractToken(request);

    // Token auth (only enforce if MCP_AUTH_TOKEN is set)
    if (AUTH_MODE === "token" && AUTH_TOKEN) {
      if (!token || token !== AUTH_TOKEN) {
        logger.warn("auth failed: invalid or missing token");
        throw new Error("invalid or missing auth token");
      }
    }

    // HMAC auth (only enforce if both key and secret are configured)
    if (AUTH_MODE === "hmac" && HMAC_KEY_ID && HMAC_SECRET) {
      const keyId = (request.headers?.["x-mcp-keyid"] ?? request.headers?.["x-mcp-key"]) as string | undefined;
      const ts = request.headers?.["x-mcp-timestamp"] as string | undefined;
      const sig = request.headers?.["x-mcp-signature"] as string | undefined;
      if (!keyId || !ts || !sig) {
        throw new Error("missing hmac headers");
      }
      const tsInt = parseInt(ts, 10);
      if (isNaN(tsInt) || Math.abs(Date.now() / 1000 - tsInt) > 300) {
        throw new Error("stale timestamp");
      }
      if (keyId !== HMAC_KEY_ID) {
        throw new Error("unknown key id");
      }
      const method = (request.method ?? "POST").toUpperCase();
      const url = request.url ?? "/mcp";
      const path = url.split("?")[0] ?? "/mcp";
      const base = `${tsInt}\n${method}\n${path}`;
      const expected = crypto.createHmac("sha256", HMAC_SECRET).update(base).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
        throw new Error("invalid signature");
      }
    }

    let config: ConfigView = {};
    if (CONTROL_BASE && token) {
      try {
        const runtimeContext = buildRuntimeContext(request);
        config = await fetchControlConfig(token, configSchema, runtimeContext);
      } catch (err) {
        if (CONFIG_REQUIRED) {
          logger.error("control config resolution failed:", err);
          throw new Error(`control config resolution failed: ${err}`);
        }
        logger.warn("control config fetch failed (non-fatal):", err);
      }
    } else if (CONTROL_BASE && CONFIG_REQUIRED && !token) {
      logger.warn("missing auth token for control config resolution");
      throw new Error("missing auth token for control config resolution");
    }

    logger.debug("auth and config resolution complete");
    return { config };
  };
}
