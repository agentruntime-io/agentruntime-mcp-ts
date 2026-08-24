/** Parse Control rate-limit retry hints from HTTP header or JSON body. */

export function retryAfterFromControlBody(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return 0;
  try {
    const parsed = JSON.parse(trimmed) as {
      retry_after?: unknown;
      details?: { retry_after?: unknown };
    };
    if (typeof parsed.retry_after === "number" && parsed.retry_after > 0) {
      return parsed.retry_after;
    }
    const ra = parsed.details?.retry_after;
    if (typeof ra === "number" && ra > 0) return ra;
  } catch {
    return 0;
  }
  return 0;
}

export function parseRetryAfterHeader(headerValue: string | null, body: string): number {
  const h = (headerValue ?? "").trim();
  if (h) {
    const n = parseInt(h, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return retryAfterFromControlBody(body);
}
