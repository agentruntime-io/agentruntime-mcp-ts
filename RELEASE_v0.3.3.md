# @agentruntime-labs/agentruntime-mcp v0.3.3

## Tool schema: Zod v4 native JSON Schema

- **`emitJsonShape`** — uses Zod v4 native `z.toJSONSchema()` (replaces broken `zod-to-json-schema` path for Zod 4 schemas).
- **`z.enum([...])`** — emits schema `enum`.
- **`.default(value)`** — emits schema `default` when set explicitly on the Zod field.

Parity with `agentruntime-mcp-go@v0.3.3` and `agentruntime-mcp@0.3.3`.
