/**
 * Per-request bearer token — parity with agentruntime-mcp-go request_bearer.go
 */
import { AsyncLocalStorage } from "node:async_hooks";

const bearerStorage = new AsyncLocalStorage<string>();

export function withRequestBearer(token: string): string {
  return token.trim();
}

export function requestBearerFromContext(): string {
  return bearerStorage.getStore() ?? "";
}

export function runWithRequestBearerAsync<T>(token: string, fn: () => Promise<T>): Promise<T> {
  const t = withRequestBearer(token);
  if (!t) return fn();
  return bearerStorage.run(t, fn);
}

export function runWithRequestBearer<T>(token: string, fn: () => T): T {
  const t = withRequestBearer(token);
  if (!t) return fn();
  return bearerStorage.run(t, fn);
}
