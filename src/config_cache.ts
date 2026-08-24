/**
 * In-process MCP config cache, singleflight, and 429 retry — mirrors agentruntime-mcp-go.
 */
import { createHash } from "node:crypto";
import type { ConfigView } from "./context.js";
import { ControlError } from "./errors.js";
import { fetchControlPayload } from "./control_client.js";
import { retryAfterFromControlBody } from "./retry_after.js";
import { logger } from "./logger.js";

export const DEFAULT_CONFIG_CACHE_TTL_SEC = 60;
export const DEFAULT_CONFIG_RETRY_BUDGET_SEC = 30;
export const MIN_CONFIG_CACHE_TTL_SEC = 30;
export const MAX_CONFIG_CACHE_TTL_SEC = 120;
export const DEFAULT_RATE_LIMIT_WAIT_SEC = 5;
export const RATE_LIMIT_WAIT_LOG_THRESHOLD_MS = 2000;

interface CacheEntry {
  config: ConfigView;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ConfigView>>();

export async function fetchControlConfigCached(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): Promise<ConfigView> {
  if (!token.trim()) {
    return fetchControlConfigWithRetry(token, configSchema, runtimeContext);
  }

  const key = configCacheKey(token, configSchema, runtimeContext);
  const hit = cacheGet(key);
  if (hit) return hit;

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const again = cacheGet(key);
        if (again) return again;
        const cfg = await fetchControlConfigWithRetry(token, configSchema, runtimeContext);
        putConfigCacheEntry(key, cfg);
        return cloneConfigView(cfg);
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, pending);
  }
  return pending;
}

export async function fetchControlConfigWithRetry(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): Promise<ConfigView> {
  const deadline = Date.now() + configRetryBudgetMs();
  let attempt = 0;

  for (;;) {
    try {
      const p = await fetchControlPayload(token, configSchema, runtimeContext);
      return p.config ?? {};
    } catch (err) {
      if (!(err instanceof ControlError) || err.status !== 429) {
        throw err;
      }
      const waitMs = rateLimitWaitMs(err, attempt);
      if (waitMs <= 0) throw err;
      if (Date.now() + waitMs > deadline) {
        logger.warn(
          `mcp control config: rate limit retry budget exhausted after ${attempt + 1} attempt(s)`
        );
        throw err;
      }
      if (waitMs >= RATE_LIMIT_WAIT_LOG_THRESHOLD_MS) {
        logger.warn(
          `mcp control config: rate limited (capacity), waiting ${waitMs}ms before retry (attempt ${attempt + 1})`
        );
      }
      await sleep(waitMs);
      attempt += 1;
    }
  }
}

export function rateLimitWaitMs(err: ControlError, attempt: number): number {
  let sec = err.retryAfterSec || retryAfterFromControlBody(err.bodyText);
  if (sec <= 0) sec = DEFAULT_RATE_LIMIT_WAIT_SEC;
  sec = Math.max(1, Math.min(sec, 60));
  if (attempt > 0 && !err.retryAfterSec && retryAfterFromControlBody(err.bodyText) <= 0) {
    sec = Math.min(sec * 2 ** attempt, 60);
  }
  return sec * 1000;
}

export { retryAfterFromControlBody } from "./retry_after.js";
export { parseRetryAfterHeader } from "./retry_after.js";

export function configCacheKey(
  token: string,
  configSchema: Record<string, unknown>,
  runtimeContext: Record<string, unknown>
): string {
  return [tokenFingerprint(token), runtimeContextInstanceKey(runtimeContext), configSchemaHash(configSchema)].join(
    "|"
  );
}

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex").slice(0, 16);
}

export function runtimeContextInstanceKey(runtimeContext: Record<string, unknown>): string {
  const inst = String(runtimeContext.instance_id ?? "").trim();
  if (inst) return inst;
  const sid = String(runtimeContext.server_id ?? "").trim();
  if (sid) return `server:${sid}`;
  return "";
}

export function configSchemaHash(configSchema: Record<string, unknown>): string {
  if (!configSchema || Object.keys(configSchema).length === 0) return "empty";
  try {
    const raw = JSON.stringify(configSchema);
    return createHash("sha256").update(raw).digest("hex").slice(0, 16);
  } catch {
    return "marshal-error";
  }
}

export function configCacheTtlMs(): number {
  let sec = DEFAULT_CONFIG_CACHE_TTL_SEC;
  const raw = (process.env.MCP_CONFIG_CACHE_TTL_SEC ?? "").trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) sec = n;
  }
  sec = Math.max(MIN_CONFIG_CACHE_TTL_SEC, Math.min(sec, MAX_CONFIG_CACHE_TTL_SEC));
  return sec * 1000;
}

export function configRetryBudgetMs(): number {
  let sec = DEFAULT_CONFIG_RETRY_BUDGET_SEC;
  const raw = (process.env.MCP_CONFIG_RETRY_BUDGET_SEC ?? "").trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) sec = n;
  }
  return sec * 1000;
}

export function putConfigCacheEntry(key: string, cfg: ConfigView): void {
  cache.set(key, { config: cloneConfigView(cfg), expiresAt: Date.now() + configCacheTtlMs() });
}

function cacheGet(key: string): ConfigView | null {
  const ent = cache.get(key);
  if (!ent) return null;
  if (Date.now() >= ent.expiresAt) {
    cache.delete(key);
    return null;
  }
  return cloneConfigView(ent.config);
}

function cloneConfigView(inCfg: ConfigView): ConfigView {
  return { ...inCfg };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test hook — clears in-memory cache and inflight map. */
export function resetConfigCacheForTest(): void {
  cache.clear();
  inflight.clear();
}
