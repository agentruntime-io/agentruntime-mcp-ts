/**
 * Tests for runtime (loadConfig, makeServer)
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, makeServer } from "./runtime.js";

describe("loadConfig", () => {
  it("returns empty object for missing file", () => {
    const cfg = loadConfig("nonexistent.yaml");
    expect(cfg).toEqual({});
  });

  it("loads valid config", () => {
    const tmpDir = os.tmpdir();
    const configPath = path.join(tmpDir, `mcp-test-${Date.now()}.yaml`);
    try {
      fs.writeFileSync(
        configPath,
        `
server:
  name: TestServer
  port: 9000
auth:
  mode: token
tracing:
  enabled: false
config: {}
`
      );
      const cfg = loadConfig(configPath);
      expect(cfg.server?.name).toBe("TestServer");
      expect(cfg.server?.port).toBe(9000);
      expect(cfg.tracing?.enabled).toBe(false);
    } finally {
      try {
        fs.unlinkSync(configPath);
      } catch {
        /* ignore */
      }
    }
  });
});

describe("makeServer", () => {
  let configPath: string;

  beforeEach(() => {
    configPath = path.join(os.tmpdir(), `mcp-test-${Date.now()}.yaml`);
    fs.writeFileSync(
      configPath,
      `
server:
  name: TestMCP
auth:
  mode: none
tracing:
  enabled: false
config: {}
`
    );
  });

  afterEach(() => {
    try {
      fs.unlinkSync(configPath);
    } catch {
      /* ignore */
    }
  });

  it("creates FastMCP server", () => {
    const server = makeServer(configPath);
    expect(server).toBeDefined();
    expect(server).toHaveProperty("getApp");
  });
});
