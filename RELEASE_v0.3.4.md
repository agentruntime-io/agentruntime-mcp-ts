# @agentruntime-labs/agentruntime-mcp v0.3.4

## Control config cache and 429 retry

Parity with `agentruntime-mcp-go@v0.3.8` control-config path (TypeScript connectors do not ship OAuth middleware in this release).

### New modules

- **`config_cache.ts`** — `fetchControlConfigCached`, `fetchControlConfigWithRetry`, cache key helpers, singleflight via in-flight `Promise` map.
- **`control_client.ts`** — low-level `fetchControlPayload` HTTP client (split from `control.ts`).
- **`retry_after.ts`** — `parseRetryAfterHeader`, `retryAfterFromControlBody`.

### Updated APIs

- **`ControlError`** — new `retryAfterSec` field.
- **`fetchControlConfig`** — routes through cached path.
- **`middleware.ts`** — unchanged call site; benefits from cache automatically.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_CONFIG_CACHE_TTL_SEC` | `60` | Cache TTL (clamped 30–120) |
| `MCP_CONFIG_RETRY_BUDGET_SEC` | `30` | Max wall time for 429 retries |

## Upgrade

```bash
npm install @agentruntime-labs/agentruntime-mcp@0.3.4
```
