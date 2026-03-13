/**
 * Structured logging for the MCP SDK.
 * Set MCP_LOG_LEVEL=debug for verbose logging.
 */

const LOG_LEVEL = (process.env.MCP_LOG_LEVEL ?? "").toLowerCase();
const IS_DEBUG = LOG_LEVEL === "debug";

export const logger = {
  debug: (msg: string, ...args: unknown[]) => {
    if (IS_DEBUG) {
      console.error(`[agentruntime-mcp] [DEBUG] ${msg}`, ...args);
    }
  },
  info: (msg: string, ...args: unknown[]) => {
    console.error(`[agentruntime-mcp] [INFO] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.error(`[agentruntime-mcp] [WARN] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[agentruntime-mcp] [ERROR] ${msg}`, ...args);
  },
};
