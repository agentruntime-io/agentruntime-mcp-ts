/**
 * Tool registry - TypeScript equivalent of Python decorators.
 * Register tools with Zod input/output schemas.
 */
import type { z } from "zod";
import type { ConfigView } from "./context.js";
import { getConfig } from "./context.js";

export interface ToolEntry<TIn = unknown, TOut = unknown> {
  name: string;
  description?: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema?: z.ZodType<TOut>;
  execute: (args: TIn, config: ConfigView) => TOut | Promise<TOut>;
}

const registry: ToolEntry[] = [];

export function tool<TIn, TOut>(options: {
  name: string;
  description?: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema?: z.ZodType<TOut>;
  execute: (args: TIn, config: ConfigView) => TOut | Promise<TOut>;
}): void {
  registry.push(options as ToolEntry);
}

export function getRegistry(): readonly ToolEntry[] {
  return registry;
}

/** Session auth type: config is attached by ControlConfigMiddleware */
export interface AgentRuntimeSession {
  config?: ConfigView;
}

export function mountTools(
  server: { addTool: (opts: object) => void },
  _schemaBuilder: (inSchema: z.ZodType | null, outSchema: z.ZodType | null) => [Record<string, unknown>, Record<string, unknown>],
  getConfigFromContext?: (context: { session?: AgentRuntimeSession }) => ConfigView
): void {
  const configGetter = getConfigFromContext ?? (() => getConfig());

  for (const entry of registry) {
    const toolOpts: Record<string, unknown> = {
      name: entry.name,
      description: entry.description ?? "",
      parameters: entry.inputSchema,
      execute: async (args: unknown, context: { session?: AgentRuntimeSession }) => {
        const config = configGetter(context);
        const result = await entry.execute(args, config);
        if (typeof result === "object" && result !== null) {
          return JSON.stringify(result);
        }
        return String(result);
      },
    };

    // MCP 2025-06-18: FastMCP 3.34+ converts Zod outputSchema via toJsonSchema
    if (entry.outputSchema) {
      toolOpts.outputSchema = entry.outputSchema;
    }

    server.addTool(toolOpts);
  }
}
