/**
 * MCP runtime — mirror agentruntime-mcp-go runtime.go using @modelcontextprotocol/server streamable HTTP.
 */
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { middleware, type StreamableHttpNext } from "./middleware.js";
import { logger } from "./logger.js";
import { initTracing, wrapWithTracing, type TracingConfigSlice } from "./tracing.js";
import { newSchemaWriter } from "./config_schema.js";
import { instantiateAdapters, listAdapterNames } from "./adapter.js";

export interface ServerConfig extends TracingConfigSlice {
  server?: {
    name?: string;
    host?: string;
    port?: number;
    stateless_http?: boolean;
  };
  auth?: { mode?: string };
  config?: Record<string, unknown>;
}

export function loadConfig(configPath = "config.yaml"): ServerConfig {
  let p = configPath;
  if (!path.isAbsolute(p)) {
    p = path.join(process.cwd(), p);
  }
  if (!fs.existsSync(p)) {
    return {};
  }
  const raw = fs.readFileSync(p, "utf8");
  return (yaml.load(raw) as ServerConfig) ?? {};
}

export function makeServer(cfg: ServerConfig): { server: McpServer; configSchema: Record<string, unknown> } {
  const name = cfg.server?.name?.trim() || "MCPServer";
  const configSchema: Record<string, unknown> = { ...(cfg.config ?? {}) };
  const server = new McpServer({ name, version: "0.0.1" });
  return { server, configSchema };
}

export type SetupFn = (server: McpServer, configSchema: Record<string, unknown>) => void | Promise<void>;

async function createListeningStack(
  cfg: ServerConfig,
  configSchema: Record<string, unknown>,
  transport: NodeStreamableHTTPServerTransport,
  mountPath: string
): Promise<{ handler: http.RequestListener; host: string; port: number }> {
  const inner: StreamableHttpNext = (req, res, parsedBody) => transport.handleRequest(req, res, parsedBody);
  const mw = middleware(configSchema, inner, mountPath);

  let handler: http.RequestListener = async (req, res) => {
    let parsedBody: unknown = undefined;
    if ((req.method ?? "").toUpperCase() === "POST") {
      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(Buffer.from(ch));
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) {
        try {
          parsedBody = JSON.parse(raw);
        } catch {
          parsedBody = undefined;
        }
      }
    }
    await mw(req, res, parsedBody);
  };

  handler = wrapWithTracing(cfg, handler);

  const host = process.env.HOST?.trim() || cfg.server?.host || "127.0.0.1";
  let port = cfg.server?.port ?? 8000;
  const pe = process.env.PORT?.trim();
  if (pe) {
    const n = parseInt(pe, 10);
    if (!Number.isNaN(n)) port = n;
  }

  return { handler, host, port };
}

/** Single MCP mount at /mcp — mirrors RunWithConfig. */
export async function runWithConfig(cfg: ServerConfig, setup: SetupFn): Promise<http.Server> {
  if (!cfg) cfg = {};
  await initTracing(cfg);

  const { server, configSchema } = makeServer(cfg);
  await setup(server, configSchema);

  const stateless = cfg.server?.stateless_http ?? true;
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: stateless ? undefined : () => randomUUID(),
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const { handler, host, port } = await createListeningStack(cfg, configSchema, transport, "/mcp");
  const srv = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    srv.listen(port, host, () => resolve());
    srv.on("error", reject);
  });

  logger.info(`MCP server listening on ${host}:${port}`);
  return srv;
}

export async function run(configPath: string, setup?: SetupFn): Promise<http.Server> {
  const cfg = loadConfig(configPath);
  if (!setup) {
    const { mountDeclarativeTools } = await import("./registry.js");
    return runWithConfig(cfg, async (server) => {
      mountDeclarativeTools(server);
    });
  }
  return runWithConfig(cfg, setup);
}

/** Plugin registry — optional adapter name filter (empty = all). */
export async function runWithRegistry(configPath: string, ...adapterNames: string[]): Promise<http.Server> {
  const names = adapterNames.length ? adapterNames : listAdapterNames();
  const adapters = await instantiateAdapters(names);
  const cfg = loadConfig(configPath);
  return runWithConfig(cfg, async (server, schema) => {
    const sw = newSchemaWriter(schema);
    for (const a of adapters) {
      a.register(server, sw);
    }
  });
}
