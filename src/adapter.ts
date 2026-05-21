/**
 * Adapter registry — mirror agentruntime-mcp-go adapter.go.
 * Official MCP server types come from @modelcontextprotocol/server.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServeMux } from "./serve_mux.js";
import type { SchemaWriter } from "./config_schema.js";
import { ErrAdapterNotFound } from "./errors.js";

export interface Adapter {
  register(server: McpServer, schema: SchemaWriter): void;
}

export interface WebhookAdapter {
  registerWebhook(mux: ServeMux): void;
}

export interface AdapterConstructorInput {}

export type AdapterConstructor = (input: AdapterConstructorInput) => Adapter | Promise<Adapter>;

const registry = new Map<string, AdapterConstructor>();

export function registerAdapter(name: string, ctor: AdapterConstructor): void {
  registry.set(name, ctor);
}

export function listAdapterNames(): string[] {
  return [...registry.keys()].sort();
}

export async function instantiateAdapters(names: string[]): Promise<Adapter[]> {
  const input: AdapterConstructorInput = {};
  if (names.length === 0) {
    const out: Adapter[] = [];
    for (const ctor of registry.values()) {
      out.push(await ctor(input));
    }
    return out;
  }
  const out: Adapter[] = [];
  for (const name of names) {
    const ctor = registry.get(name);
    if (!ctor) throw new ErrAdapterNotFound(name);
    out.push(await ctor(input));
  }
  return out;
}
