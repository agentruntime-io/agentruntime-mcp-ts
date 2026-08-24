/**
 * Low-level Control POST /mcp/config HTTP client.
 */
import { ControlError, errControlConfig } from "./errors.js";
import type { ConfigView } from "./context.js";
import { parseRetryAfterHeader } from "./retry_after.js";

export interface ControlPayload {
  config: ConfigView;
  configSchema: Record<string, unknown>;
  bridge?: Record<string, unknown>;
}

export async function fetchControlPayload(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): Promise<ControlPayload> {
  const base = (process.env.MCP_CONTROL_SERVER_URL ?? "").trim().replace(/\/$/, "");
  if (!base) {
    return { config: {}, configSchema: {} };
  }

  let timeoutSec = 5;
  const ts = process.env.MCP_CONTROL_TIMEOUT_SEC?.trim();
  if (ts) {
    const n = parseInt(ts, 10);
    if (!Number.isNaN(n) && n > 0) timeoutSec = n;
  }

  const payload = {
    configSchema,
    config_schema: configSchema,
    schema: configSchema,
    runtimeContext,
    runtime_context: runtimeContext,
  };

  let res: Response;
  try {
    res = await fetch(`${base}/mcp/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutSec * 1000),
    });
  } catch (e) {
    throw new Error(`${String(errControlConfig)}: ${e instanceof Error ? e.message : String(e)}`);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw new ControlError(
      res.status,
      bodyText,
      parseRetryAfterHeader(res.headers.get("Retry-After"), bodyText)
    );
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    throw new ControlError(502, `${String(errControlConfig)}: invalid response`, 0);
  }

  const out: ControlPayload = { config: {}, configSchema: {} };
  const c = data.config;
  if (c && typeof c === "object" && !Array.isArray(c)) out.config = c as ConfigView;
  const cs = data.config_schema;
  if (cs && typeof cs === "object" && !Array.isArray(cs)) {
    out.configSchema = cs as Record<string, unknown>;
  }
  const b = data.bridge;
  if (b && typeof b === "object" && !Array.isArray(b)) {
    out.bridge = b as Record<string, unknown>;
  }
  return out;
}
