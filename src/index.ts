/**
 * AgentRuntime MCP SDK (TypeScript)
 * Opinionated SDK for building MCP agents with FastMCP.
 */
export { tool, getRegistry, mountTools, type ToolEntry, type AgentRuntimeSession } from "./registry.js";
export { run, makeServer, loadConfig, type ServerConfig } from "./runtime.js";
export { emitJsonShape, emitFlatShape, buildSchemas, type ZodSchema } from "./schemas.js";
export { getConfig, setRequestContext, runWithConfig, runWithConfigAsync, type ConfigView } from "./context.js";
export { buildProxyApp, runProxy } from "./proxy.js";
export { createAuthenticate, extractToken, isSchemaEndpoint } from "./middleware.js";
