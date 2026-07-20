/**
 * Declarative tool registry — convenience layer on top of McpServer.registerTool.
 */
import type { z } from "zod";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { configFromContext, type ConfigView } from "./context.js";

export interface ToolEntry<TIn = unknown, TOut = unknown> {
  name: string;
  description?: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema?: z.ZodType<TOut>;
  execute: (args: TIn, config: ConfigView) => TOut | Promise<TOut>;
  /** When true, tool is registered in dev but excluded from catalog/publish. */
  hold?: boolean;
}

const registry: ToolEntry[] = [];

export function tool<TIn, TOut>(options: ToolEntry<TIn, TOut>): void {
  registry.push(options as ToolEntry);
}

export function getRegistry(): readonly ToolEntry[] {
  return registry;
}

export function registeredToolNames(): string[] {
  return registry.map((entry) => entry.name);
}

export function heldToolNames(): string[] {
  return registry.filter((entry) => entry.hold).map((entry) => entry.name);
}

export function getPublishableRegistry(): readonly ToolEntry[] {
  return registry.filter((entry) => !entry.hold);
}

export function resetRegistry(): void {
  registry.length = 0;
}

function toToolResult(result: unknown): CallToolResult {
  if (typeof result === "object" && result !== null) {
    const structured = result as Record<string, unknown>;
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: structured,
    };
  }
  return { content: [{ type: "text", text: String(result) }] };
}

/** Register all tools declared via {@link tool} onto an MCP server instance. */
export function mountDeclarativeTools(server: McpServer): void {
  for (const entry of registry) {
    server.registerTool(
      entry.name,
      {
        description: entry.description ?? "",
        inputSchema: entry.inputSchema,
        ...(entry.outputSchema ? { outputSchema: entry.outputSchema } : {}),
      },
      async (args: unknown): Promise<CallToolResult> => {
        const parsed = entry.inputSchema.parse(args);
        const cfg = configFromContext();
        const result = await entry.execute(parsed, cfg);
        return toToolResult(result);
      }
    );
  }
}
