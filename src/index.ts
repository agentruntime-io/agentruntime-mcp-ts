/**
 * AgentRuntime MCP SDK (TypeScript) — parity with github.com/agentruntime-io/agentruntime-mcp-go.
 * Uses @modelcontextprotocol/server streamable HTTP with JSON responses.
 */

export {
  registerAdapter,
  listAdapterNames,
  instantiateAdapters,
  type Adapter,
  type WebhookAdapter,
  type AdapterConstructor,
  type AdapterConstructorInput,
} from "./adapter.js";

export {
  CONFIG_TYPE_STRING,
  CONFIG_TYPE_NUMBER,
  CONFIG_TYPE_BOOL,
  field,
  stringField,
  optRequired,
  optDefault,
  newSchemaWriter,
  writeSchema,
  configSchemaHasKeys,
  type SchemaWriter,
  type ConfigField,
  type ConfigFieldDef,
  type ConfigFieldOpt,
} from "./config_schema.js";

export {
  loadConfig,
  makeServer,
  run,
  runWithConfig,
  runWithRegistry,
  type ServerConfig,
  type SetupFn,
} from "./runtime.js";

export { handlerForAdapter, runWithRouter } from "./router.js";

export { BRIDGE_MOUNT_PATH, handlerForBridge } from "./bridge.js";

export {
  applyAuthMapping,
  applyHeaderMappings,
  applyBridgeHeaders,
} from "./bridge_auth.js";

export { middleware, type StreamableHttpNext } from "./middleware.js";

export {
  configFromContext,
  getConfig,
  runWithResolvedConfig,
  runWithResolvedConfigAsync,
  configGetStr,
  type ConfigView,
} from "./context.js";

export {
  ErrAdapterNotFound,
  ControlError,
  humanMessageFromControlAPIBody,
  errConfigLoad,
  errControlConfig,
  errProxyTarget,
  errAdapterNotRegistered,
} from "./errors.js";

export { tool, mountDeclarativeTools, getRegistry, type ToolEntry } from "./registry.js";

export { buildProxyApp, runProxy } from "./proxy.js";

export { signModeB as SignModeB, deliverModeB as DeliverModeB, type ModeBRequest } from "./webhook.js";

export {
  HEADER_MCP_INSTANCE_ID,
  HEADER_MCP_SERVER_ID,
  buildRuntimeContext,
  fetchControlPayload,
  type ControlPayload,
} from "./control.js";

export { emitJsonShape, emitFlatShape, buildSchemas, type ZodSchema } from "./schemas.js";

export {
  suggestFromWireName,
  formatDisplayName,
  publisherMetadata,
  defaultPublisherMetadata,
  groupLabel,
  parseMetadata,
  metadataIsEmpty,
  mergeEffective,
  type Metadata as ToolOrgMetadata,
  type EffectiveOrganization,
  type ToolGroup,
} from "./toolorg.js";

export {
  requestBearerFromContext,
  runWithRequestBearer,
  runWithRequestBearerAsync,
} from "./request_bearer.js";
