/**
 * Request-scoped config context.
 * Resolved config from control server is exposed here for tool handlers.
 */
import { AsyncLocalStorage } from "async_hooks";

export type ConfigView = Record<string, unknown>;

const configStorage = new AsyncLocalStorage<ConfigView>();

export function getConfig(): ConfigView {
  const cfg = configStorage.getStore();
  return cfg ?? {};
}

export function setRequestContext(config: ConfigView): void {
  configStorage.enterWith(config);
}

export function runWithConfig<T>(config: ConfigView, fn: () => T): T {
  return configStorage.run(config, fn);
}

export function runWithConfigAsync<T>(config: ConfigView, fn: () => Promise<T>): Promise<T> {
  return configStorage.run(config, fn);
}
