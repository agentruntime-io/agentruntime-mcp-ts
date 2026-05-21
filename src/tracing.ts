/**
 * OpenTelemetry — mirror agentruntime-mcp-go tracing.go (minimal HTTP span wrapper).
 */
import type http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import { logger } from "./logger.js";

export interface TracingConfigSlice {
  tracing?: { enabled?: boolean };
}

function shouldEnableTracing(cfg?: TracingConfigSlice): boolean {
  const od = process.env.OTEL_SDK_DISABLED?.trim().toLowerCase();
  if (od === "true" || od === "1" || od === "yes") return false;
  if (cfg?.tracing?.enabled === false) return false;
  return true;
}

let tracerInitialized = false;

export async function initTracing(cfg?: TracingConfigSlice): Promise<void> {
  if (tracerInitialized) return;
  if (!shouldEnableTracing(cfg)) return;

  try {
    const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
    const { BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { Resource } = await import("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");

    const endpointRaw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() ?? "http://127.0.0.1:4318";
    const endpoint = endpointRaw.replace(/\/$/, "");
    const serviceName = process.env.OTEL_SERVICE_NAME?.trim() ?? "agentruntime-mcp";

    const exporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    });

    const resource = new Resource({ [ATTR_SERVICE_NAME]: serviceName });
    const provider = new NodeTracerProvider({ resource });
    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    provider.register();
    tracerInitialized = true;
    logger.debug("OpenTelemetry tracing initialized");
  } catch (err) {
    logger.warn("OpenTelemetry setup failed (tracing disabled):", err);
  }
}

export async function initTracingFromConfigPath(configPath?: string): Promise<void> {
  let cfg: TracingConfigSlice | undefined;
  if (configPath) {
    try {
      const resolved = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
      if (fs.existsSync(resolved)) {
        const raw = fs.readFileSync(resolved, "utf8");
        cfg = (yaml.load(raw) as TracingConfigSlice) ?? {};
      }
    } catch {
      /* ignore */
    }
  }
  await initTracing(cfg);
}

/** Wrap Node HTTP listener when tracing is enabled. */
export function wrapWithTracing(
  cfg: TracingConfigSlice | undefined,
  handler: http.RequestListener
): http.RequestListener {
  if (!shouldEnableTracing(cfg)) return handler;

  return (req, res) => {
    void (async () => {
      try {
        const { trace } = await import("@opentelemetry/api");
        const tracer = trace.getTracer("agentruntime-mcp");
        const urlPath = req.url?.split("?")[0] ?? "";
        await tracer.startActiveSpan(`http.request ${req.method ?? "?"} ${urlPath}`, async (span) => {
          try {
            await Promise.resolve(handler(req, res));
          } finally {
            span.end();
          }
        });
      } catch {
        await Promise.resolve(handler(req, res));
      }
    })().catch(() => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    });
  };
}
