/**
 * Runtime: load config, make server, run.
 * Mirrors Python runtime.py
 */
import * as fs from "fs";
import * as path from "path";
import { FastMCP } from "fastmcp";
import yaml from "js-yaml";
import { createAuthenticate } from "./middleware.js";
import { mountTools } from "./registry.js";
import { buildSchemas } from "./schemas.js";

export interface ServerConfig {
  server?: {
    name?: string;
    host?: string;
    port?: number;
    stateless_http?: boolean;
  };
  auth?: { mode?: string };
  tracing?: { enabled?: boolean };
  config?: Record<string, unknown>;
}

export function loadConfig(configPath: string = "config.yaml"): ServerConfig {
  const resolved = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) {
    return {};
  }
  const raw = fs.readFileSync(resolved, "utf-8");
  return (yaml.load(raw) as ServerConfig) ?? {};
}

export function makeServer(configPath: string = "config.yaml"): FastMCP {
  const cfg = loadConfig(configPath);
  const name = cfg.server?.name ?? "MCPServer";
  const configSchema = (cfg.config ?? {}) as Record<string, unknown>;

  const server = new FastMCP({
    name,
    version: "0.0.1",
    authenticate: createAuthenticate(configSchema),
  });

  mountTools(
    server as { addTool: (opts: object) => void },
    buildSchemas,
    (ctx) => (ctx?.session as { config?: Record<string, unknown> } | undefined)?.config ?? {}
  );

  // Schema endpoint: GET /mcp/config/schema
  const app = server.getApp();
  app.get("/mcp/config/schema", (c) => c.json(configSchema));

  return server;
}

export async function run(configPath: string = "config.yaml"): Promise<void> {
  const { initTracing } = await import("./tracing.js");
  await initTracing(configPath);

  const server = makeServer(configPath);
  const cfg = loadConfig(configPath);
  const host = process.env.HOST ?? cfg.server?.host ?? "127.0.0.1";
  const port = parseInt(process.env.PORT ?? String(cfg.server?.port ?? 8000), 10);

  await server.start({
    transportType: "httpStream",
    httpStream: { port, host },
  });
}
