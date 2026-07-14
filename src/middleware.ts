/**
 * HTTP middleware — mirror agentruntime-mcp-go middleware.go
 */
import type http from "node:http";
import { extractToken, isSchemaEndpointForMount, needsResolvedConfig } from "./auth_http.js";
import { buildRuntimeContext, fetchControlConfig, logRuntimeContextSummary } from "./control.js";
import { ControlError, humanMessageFromControlAPIBody } from "./errors.js";
import { configSchemaHasKeys } from "./config_schema.js";
import {
  envAloneSatisfiesRequired,
  envOverridesFromSchema,
  mergeControlWithEnvPriority,
  newLowercaseEnvIndex,
} from "./env_schema.js";
import { logger } from "./logger.js";
import { runWithResolvedConfigAsync, type ConfigView } from "./context.js";
import { runWithRequestBearerAsync } from "./request_bearer.js";
import { normalizePath, splitQuery } from "./serve_mux.js";

export type StreamableHttpNext = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedBody?: unknown
) => Promise<void>;

export function middleware(
  configSchema: Record<string, unknown>,
  next: StreamableHttpNext,
  mountPath = "/mcp"
): StreamableHttpNext {
  const mp = mountPath === "" ? "/mcp" : mountPath;
  const configRequired = (process.env.MCP_CONFIG_FETCH_REQUIRED ?? "true").toLowerCase() !== "false";
  const controlBase = (process.env.MCP_CONTROL_SERVER_URL ?? "").trim();
  const wantControl = configSchemaHasKeys(configSchema);

  return async (req, res, parsedBody): Promise<void> => {
    if (isSchemaEndpointForMount(req, mp)) {
      logger.debug("serving schema endpoint");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(configSchema));
      return;
    }

    let cfg: ConfigView = {};
    const token = extractToken(req);
    const needConfig = needsResolvedConfig(parsedBody);

    const envIdx = newLowercaseEnvIndex();
    const envKeys = envOverridesFromSchema(configSchema, envIdx);

    if (wantControl && needConfig) {
      const tryControl = controlBase !== "" && token !== "";

      if (tryControl) {
        const ctx = buildRuntimeContext(req);
        const urlPath = normalizePath(splitQuery(req.url ?? "")[0]);
        const hdrRaw = req.headers["x-mcp-instance-id"];
        const hdr =
          typeof hdrRaw === "string" ? hdrRaw : Array.isArray(hdrRaw) ? hdrRaw[0] ?? "" : "";
        logRuntimeContextSummary(urlPath, ctx, needConfig, hdr.trim().length);

        try {
          const resolved = await fetchControlConfig(token, configSchema, ctx);
          if (resolved !== null && resolved !== undefined) {
            cfg = resolved;
            logger.debug("control config resolved successfully");
          }
        } catch (err) {
          logger.error(`control config fetch failed: ${err instanceof Error ? err.message : String(err)}`);
          if (configRequired && !envAloneSatisfiesRequired(configSchema, envIdx)) {
            let status = 502;
            let clientMsg = `control config resolution failed: ${err instanceof Error ? err.message : String(err)}`;
            if (err instanceof ControlError) {
              status = err.status;
              const hm = humanMessageFromControlAPIBody(err.bodyText);
              if (hm) clientMsg = `MCP control config: ${hm}`;
              if (status === 401 || status === 403) status = 422;
              if (status < 400 || status >= 600) status = 502;
            }
            res.statusCode = status;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(clientMsg);
            return;
          }
        }
      } else {
        if (controlBase === "" && configRequired && !envAloneSatisfiesRequired(configSchema, envIdx)) {
          logger.warn("MCP_CONTROL_SERVER_URL is required when the adapter registers config schema keys");
          res.statusCode = 503;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("MCP_CONTROL_SERVER_URL is required when config schema has keys");
          return;
        }
        if (controlBase !== "" && token === "" && configRequired && !envAloneSatisfiesRequired(configSchema, envIdx)) {
          logger.warn("missing auth token for control config resolution");
          res.statusCode = 401;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("missing auth token for control config resolution");
          return;
        }
      }
    }

    const finalCfg = mergeControlWithEnvPriority(cfg, envKeys, configSchema);
    await runWithRequestBearerAsync(token, () =>
      runWithResolvedConfigAsync(finalCfg, () => next(req, res, parsedBody))
    );
  };
}

export { extractToken, isSchemaEndpointForMount };
