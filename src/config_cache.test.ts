import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configCacheKey,
  fetchControlConfigWithRetry,
  rateLimitWaitMs,
  resetConfigCacheForTest,
  retryAfterFromControlBody,
} from "./config_cache.js";
import { ControlError } from "./errors.js";

describe("config_cache", () => {
  afterEach(() => {
    resetConfigCacheForTest();
    vi.restoreAllMocks();
    delete process.env.MCP_CONFIG_RETRY_BUDGET_SEC;
  });

  it("configCacheKey is stable", () => {
    const schema = { api_key: { type: "string" } };
    const ctx = { instance_id: "inst-1" };
    expect(configCacheKey("tok", schema, ctx)).toBe(configCacheKey("tok", schema, ctx));
  });

  it("retryAfterFromControlBody reads details.retry_after", () => {
    const body = JSON.stringify({ error: "rate_limited", details: { retry_after: 12 } });
    expect(retryAfterFromControlBody(body)).toBe(12);
  });

  it("rateLimitWaitMs uses retryAfterSec", () => {
    const err = new ControlError(429, "{}", 15);
    expect(rateLimitWaitMs(err, 0)).toBe(15_000);
  });

  it("fetchControlConfigWithRetry waits on 429 then succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.spyOn(await import("./control_client.js"), "fetchControlPayload").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        throw new ControlError(429, '{"error":"rate_limited"}', 1);
      }
      return { config: { api_key: "ok" }, configSchema: {} };
    });

    process.env.MCP_CONFIG_RETRY_BUDGET_SEC = "10";
    const p = fetchControlConfigWithRetry("tok", {}, { instance_id: "i1" });
    await vi.advanceTimersByTimeAsync(1100);
    const cfg = await p;
    expect(cfg.api_key).toBe("ok");
    expect(calls).toBe(2);
    vi.useRealTimers();
  });
});
