/**
 * Request-scoped resolved Control config — mirror agentruntime-mcp-go context.go
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type ConfigView = Record<string, unknown>;

const storage = new AsyncLocalStorage<ConfigView>();

/** Resolved config for the active MCP HTTP request (AsyncLocalStorage). */
export function configFromContext(): ConfigView {
  return storage.getStore() ?? {};
}

/** @deprecated Use {@link configFromContext}. */
export function getConfig(): ConfigView {
  return configFromContext();
}

export function runWithResolvedConfig<T>(cfg: ConfigView, fn: () => T): T {
  return storage.run(cfg, fn);
}

export function runWithResolvedConfigAsync<T>(cfg: ConfigView, fn: () => Promise<T>): Promise<T> {
  return storage.run(cfg, fn);
}

/** Match Go ConfigGetStr: tries prefix+key then bare key. */
export function configGetStr(cfg: ConfigView | undefined, prefix: string, key: string, defaultValue: string): string {
  if (!cfg) return defaultValue;
  const keys = prefix ? [`${prefix}${key}`, key] : [key];
  for (const k of keys) {
    const v = cfg[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v !== "") return v;
  }
  return defaultValue;
}
