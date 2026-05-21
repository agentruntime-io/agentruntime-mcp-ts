/**
 * HTTP auth helpers — mirror agentruntime-mcp-go auth.go
 */
import type http from "node:http";
import { normalizePath, splitQuery } from "./serve_mux.js";

export function extractToken(req: http.IncomingMessage): string {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const xt = req.headers["x-mcp-token"];
  const xs = typeof xt === "string" ? xt : Array.isArray(xt) ? xt[0] : "";
  return (xs ?? "").trim();
}

export function isSchemaEndpointForMount(req: http.IncomingMessage, mountPath: string): boolean {
  if ((req.method ?? "").toUpperCase() !== "GET") return false;
  const path = normalizePath(splitQuery(req.url ?? "")[0]);
  const schemaPath = normalizePath(`${mountPath.replace(/\/$/, "")}/config/schema`);
  return path === schemaPath;
}

const noConfigMethods = new Set(["tools/list", "initialize", "notifications/initialized"]);

export function needsResolvedConfig(parsedBody: unknown): boolean {
  if (!parsedBody || typeof parsedBody !== "object") return true;
  const method = (parsedBody as { method?: unknown }).method;
  if (typeof method !== "string") return true;
  return !noConfigMethods.has(method);
}
