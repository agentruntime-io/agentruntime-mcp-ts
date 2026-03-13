# AgentRuntime MCP SDK (TypeScript)

Opinionated SDK for building MCP agents with [FastMCP](https://www.npmjs.com/package/fastmcp).

> **Note:** This is the TypeScript/JavaScript equivalent of the Python [agentruntime-mcp](https://pypi.org/project/agentruntime-mcp/) package. Both share the same config format, auth modes, and control server integration.

## Install

```bash
npm install @agentruntime-labs/agentruntime-mcp fastmcp zod
```

## Minimal example

```typescript
import { z } from "zod";
import { tool, run } from "@agentruntime-labs/agentruntime-mcp";

const In = z.object({
  a: z.number(),
  b: z.number(),
});

const Out = z.object({
  result: z.number(),
  expression: z.string(),
});

tool({
  name: "add",
  description: "Add two numbers",
  inputSchema: In,
  outputSchema: Out,
  execute: async (args, config) => {
    // Resolved config from control server is exposed here.
    const region = config.region as string | undefined;
    return {
      result: args.a + args.b,
      expression: `${args.a} + ${args.b}`,
    };
  },
});

run("config.yaml");
```

## Config

- `config.yaml` controls server host/port, auth mode, and tracing.
- Env overrides: `HOST`, `PORT`, `MCP_AUTH_MODE`.

Example `config.yaml`:

```yaml
server:
  name: "MCPAuthDemo"
  host: "127.0.0.1"
  port: 8012
  stateless_http: true

auth:
  mode: token   # token|hmac|none

tracing:
  enabled: false

config:
  accessKeyId:
    type: string
    displayName: Access Key ID
    required: true
  secretAccessKey:
    type: string
    displayName: Secret Access Key
    required: true
  bucket:
    type: string
    displayName: Bucket
    required: true
  region:
    type: option
    displayName: Region
    required: true
    options:
      - label: Default
        value: us-east-1
      - label: US East (Ohio)
        value: us-east-2
```

### Auth modes

- `none`: no auth
- `token`: `Authorization: Bearer <token>` or `X-MCP-Token`; dev fallback `?auth_token=` if `ALLOW_QUERY_TOKEN=true`
- `hmac`: headers `X-MCP-KeyId`, `X-MCP-Timestamp` (unix seconds), `X-MCP-Signature` (hex(HMAC-SHA256(secret, `${ts}\n${method}\n${path}`)))

## Control config resolution

The SDK can resolve populated config values from a control server and expose them on the request context as `config` in tool handlers.

- Set `MCP_CONTROL_SERVER_URL` (e.g. `http://control-svc:8080`)
- SDK sends `POST /mcp/config` with your `config.yaml` `config:` schema
- SDK forwards auth token from middleware (`Authorization` / `X-MCP-Token`)
- SDK also forwards best-effort `runtime_context` for control-side policy/resolution
- Returned populated config is exposed as `config` in the tool `execute` callback

Environment flags:

- `MCP_CONTROL_SERVER_URL`: control server base URL
- `MCP_CONTROL_TIMEOUT_SEC`: request timeout (default `5`)
- `MCP_CONFIG_FETCH_REQUIRED`: fail request if resolution fails (default `true`)

Schema endpoint:

- `GET /mcp/config/schema` returns the raw `config:` schema from `config.yaml`.

## Proxy (library)

```typescript
import { runProxy } from "@agentruntime-labs/agentruntime-mcp";

await runProxy(
  "http://127.0.0.1:8000/mcp",
  "tools.yaml",
  undefined, // bearer token
  "127.0.0.1",
  8010
);
```

## Templates

Example MCP server using this SDK:

- [connectors/ts-connectors/resend-connector](../../connectors/ts-connectors/resend-connector/) – Resend (send_email, list_audiences)

## Comparison with Python package

| Feature | Python (agentruntime-mcp) | TypeScript (agentruntime-mcp) |
|---------|--------------------------|------------------------------|
| Base framework | FastMCP (Python) | FastMCP (npm) |
| Schema | Pydantic | Zod |
| Runtime | `run("config.yaml")` | `run("config.yaml")` |
| Tool decorator | `@tool(name=..., input_model=..., output_model=...)` | `tool({ name, inputSchema, outputSchema, execute })` |
| Config | `ctx.config` | `config` in execute 2nd arg |
| Auth | `token`, `hmac`, `none` | Same |
| Control config | `POST /mcp/config` | Same |
| Proxy | `run_proxy(...)` | `runProxy(...)` |
