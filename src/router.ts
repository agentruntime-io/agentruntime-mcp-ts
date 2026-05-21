/**
 * Multi-adapter router — mirror agentruntime-mcp-go router.go
 */
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { ErrAdapterNotFound } from "./errors.js";
import { instantiateAdapters, listAdapterNames, type Adapter, type WebhookAdapter } from "./adapter.js";
import { loadConfig, makeServer } from "./runtime.js";
import { newSchemaWriter } from "./config_schema.js";
import { middleware, type StreamableHttpNext } from "./middleware.js";
import { wrapWithTracing, initTracing } from "./tracing.js";
import { logger } from "./logger.js";
import { normalizePath, splitQuery, ServeMux } from "./serve_mux.js";

function isWebhookAdapter(a: Adapter): a is Adapter & WebhookAdapter {
  return typeof (a as { registerWebhook?: unknown }).registerWebhook === "function";
}

/** HTTP listener for one adapter at mountPath (e.g. /github/mcp). */
export async function handlerForAdapter(
  configPath: string,
  adapterName: string,
  mountPath: string
): Promise<http.RequestListener> {
  const cfg = loadConfig(configPath);
  const adapters = await instantiateAdapters([adapterName]);
  const { server, configSchema } = makeServer(cfg);
  const sw = newSchemaWriter(configSchema);
  for (const a of adapters) {
    a.register(server, sw);
  }

  const stateless = cfg.server?.stateless_http ?? true;
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: stateless ? undefined : () => randomUUID(),
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const inner: StreamableHttpNext = (req, res, parsedBody) => transport.handleRequest(req, res, parsedBody);
  const mw = middleware(configSchema, inner, mountPath);

  return async (req, res) => {
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
}

/** Monolith routes: /<adapter>/mcp plus optional WebhookAdapter routes. */
export async function runWithRouter(configPath: string): Promise<http.Server> {
  const cfg = loadConfig(configPath);
  const names = listAdapterNames();
  if (names.length === 0) {
    throw new ErrAdapterNotFound("(no adapters registered)");
  }

  await initTracing(cfg);

  const webhookMux = new ServeMux();
  for (const name of names) {
    const adapters = await instantiateAdapters([name]);
    for (const a of adapters) {
      if (isWebhookAdapter(a)) {
        a.registerWebhook(webhookMux);
      }
    }
  }

  const routeHandlers = new Map<string, http.RequestListener>();
  for (const name of names) {
    const mountPath = `/${name}/mcp`;
    routeHandlers.set(mountPath, await handlerForAdapter(configPath, name, mountPath));
  }

  let handler: http.RequestListener = async (req, res) => {
    if (webhookMux.tryDispatch(req, res)) return;
    const urlPath = normalizePath(splitQuery(req.url ?? "")[0]);
    for (const [prefix, h] of routeHandlers) {
      if (urlPath === prefix || urlPath.startsWith(`${prefix}/`)) {
        await h(req, res);
        return;
      }
    }
    res.statusCode = 404;
    res.end("not found");
  };

  handler = wrapWithTracing(cfg, handler);

  const host = process.env.HOST?.trim() || cfg.server?.host || "127.0.0.1";
  let port = cfg.server?.port ?? 8000;
  const pe = process.env.PORT?.trim();
  if (pe) {
    const n = parseInt(pe, 10);
    if (!Number.isNaN(n)) port = n;
  }

  const srv = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    srv.listen(port, host, () => resolve());
    srv.on("error", reject);
  });

  logger.info(`MCP router listening on ${host}:${port} (adapters: ${names.join(", ")})`);
  return srv;
}
