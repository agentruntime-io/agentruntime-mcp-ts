/** Error types aligned with agentruntime-mcp-go. */

export const errConfigLoad = "failed to load config" as const;
export const errControlConfig = "control config resolution failed" as const;
export const errProxyTarget = "proxy target not configured" as const;
export const errAdapterNotRegistered = "adapter not found in registry" as const;

export class ErrAdapterNotFound extends Error {
  readonly name = "ErrAdapterNotFound";
  constructor(readonly adapterName: string) {
    super(`adapter ${JSON.stringify(adapterName)} not registered`);
  }
}

export class ControlError extends Error {
  readonly name = "ControlError";
  constructor(
    readonly status: number,
    readonly bodyText: string,
    readonly retryAfterSec = 0
  ) {
    super(
      bodyText.trim()
        ? `control server returned ${status}: ${bodyText}`
        : `control server returned ${status}`
    );
  }
}

export function humanMessageFromControlAPIBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const m = JSON.parse(trimmed) as { message?: unknown };
    return typeof m.message === "string" ? m.message.trim() : "";
  } catch {
    return "";
  }
}
