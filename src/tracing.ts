/**
 * OpenTelemetry tracing setup.
 * Mirrors Python middleware tracing - OTLP over HTTP.
 * Set OTEL_SDK_DISABLED=true or tracing.enabled=false in config to disable.
 */

import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import { logger } from "./logger.js";

let tracerInitialized = false;

function shouldEnableTracing(configPath?: string): boolean {
  if (process.env.OTEL_SDK_DISABLED) {
    const v = process.env.OTEL_SDK_DISABLED.toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return false;
  }
  // Check config.yaml tracing.enabled
  if (configPath) {
    try {
      const resolved = path.isAbsolute(configPath)
        ? configPath
        : path.join(process.cwd(), configPath);
      if (fs.existsSync(resolved)) {
        const raw = fs.readFileSync(resolved, "utf-8");
        const cfg = yaml.load(raw) as { tracing?: { enabled?: boolean } };
        if (cfg?.tracing?.enabled === false) return false;
      }
    } catch {
      // Ignore config read errors
    }
  }
  return true;
}

export async function initTracing(configPath?: string): Promise<void> {
  if (tracerInitialized) return;
  if (!shouldEnableTracing(configPath)) return;

  try {
    const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
    const { BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
    const { OTLPTraceExporter } = await import(
      "@opentelemetry/exporter-trace-otlp-http"
    );
    const { Resource } = await import("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = await import(
      "@opentelemetry/semantic-conventions"
    );

    const endpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://127.0.0.1:4318";
    const serviceName = process.env.OTEL_SERVICE_NAME ?? "agentruntime-mcp";

    const exporter = new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, "")}/v1/traces`,
    });

    const resource = new Resource({ [ATTR_SERVICE_NAME]: serviceName });
    const provider = new NodeTracerProvider({ resource });
    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    provider.register();
    tracerInitialized = true;
    logger.info("OpenTelemetry tracing initialized");
  } catch (err) {
    logger.warn("OpenTelemetry setup failed (tracing disabled):", err);
  }
}
