# @agentruntime-labs/agentruntime-mcp v0.3.2

## Tool hold (`hold: true`)

- `tool({ name, hold: true, ... })` — register in dev; exclude from catalog/publish until cleared.
- Helpers: `heldToolNames()`, `getPublishableRegistry()`, `registeredToolNames()`, `resetRegistry()` (tests).
- `mountDeclarativeTools` unchanged — all registered tools remain callable in dev (phase 1).

Parity with `agentruntime-mcp-go@v0.3.2` and `agentruntime-mcp@0.3.2`.
