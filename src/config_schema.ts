/** Config schema helpers — mirror agentruntime-mcp-go config_schema.go */

export const CONFIG_TYPE_STRING = "string";
export const CONFIG_TYPE_NUMBER = "number";
export const CONFIG_TYPE_BOOL = "boolean";

export interface ConfigField {
  type: string;
  displayName: string;
  required: boolean;
  default?: unknown;
}

export interface ConfigFieldDef {
  key: string;
  field: ConfigField;
}

export type ConfigFieldOpt = (f: ConfigField) => void;

export function optRequired(): ConfigFieldOpt {
  return (f) => {
    f.required = true;
  };
}

export function optDefault(v: unknown): ConfigFieldOpt {
  return (f) => {
    f.default = v;
  };
}

export function field(key: string, typ: string, displayName: string, opts: ConfigFieldOpt[] = []): ConfigFieldDef {
  const f: ConfigField = { type: typ, displayName, required: false };
  for (const o of opts) o(f);
  return { key, field: f };
}

export function stringField(key: string, displayName: string, opts: ConfigFieldOpt[] = []): ConfigFieldDef {
  return field(key, CONFIG_TYPE_STRING, displayName, opts);
}

export interface SchemaWriter {
  add(key: string, field: ConfigField): void;
}

export function newSchemaWriter(into: Record<string, unknown>): SchemaWriter {
  const target = into ?? {};
  return {
    add(key: string, f: ConfigField): void {
      const m: Record<string, unknown> = {
        type: f.type,
        displayName: f.displayName,
        required: f.required,
      };
      if (f.default !== undefined) m.default = f.default;
      target[key] = m;
    },
  };
}

export function writeSchema(sw: SchemaWriter | null | undefined, prefix: string, defs: ConfigFieldDef[]): void {
  if (!sw) return;
  for (const d of defs) {
    sw.add(prefix + d.key, d.field);
  }
}

export function configSchemaHasKeys(schema: Record<string, unknown>): boolean {
  return Object.keys(schema).length > 0;
}
