import { afterEach, describe, expect, it } from "vitest";
import { buildRuntimeContext } from "./control.js";

describe("buildRuntimeContext", () => {
  afterEach(() => {
    delete process.env.MCP_SERVER_ID;
  });

  it("maps instance and server headers", () => {
    const ctx = buildRuntimeContext({
      headers: {
        "x-mcp-instance-id": " inst-1 ",
        "x-mcp-server-id": " srv-1 ",
      },
    });
    expect(ctx.instance_id).toBe("inst-1");
    expect(ctx.server_id).toBe("srv-1");
    expect(ctx.tool_name).toBe("__initialize");
  });

  it("prefers MCP_SERVER_ID env over X-MCP-Server-Id header", () => {
    process.env.MCP_SERVER_ID = "env-srv";
    const ctx = buildRuntimeContext({
      headers: { "x-mcp-server-id": "hdr-srv" },
    });
    expect(ctx.server_id).toBe("env-srv");
  });

  it("reads tool name headers", () => {
    const ctx = buildRuntimeContext({
      headers: { "x-mcp-tool-name": "send_email" },
    });
    expect(ctx.tool_name).toBe("send_email");
  });
});
