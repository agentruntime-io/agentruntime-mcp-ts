/**
 * Minimal path router for optional WebhookAdapter routes (Go http.ServeMux subset).
 */
import type http from "node:http";

export class ServeMux {
  private readonly routes = new Map<string, http.RequestListener>();

  /** Register exact path (normalized: no trailing slash except "/"). */
  handle(pattern: string, handler: http.RequestListener): void {
    const p = normalizePath(pattern);
    this.routes.set(p, handler);
  }

  tryDispatch(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const path = normalizePath(splitQuery(req.url ?? "")[0]);
    const h = this.routes.get(path);
    if (!h) return false;
    void Promise.resolve(h(req, res)).catch(() => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    });
    return true;
  }
}

export function normalizePath(urlPath: string): string {
  if (!urlPath || urlPath === "/") return "/";
  return urlPath.endsWith("/") ? urlPath.slice(0, -1) : urlPath;
}

export function splitQuery(url: string): [string, string] {
  const q = url.indexOf("?");
  if (q < 0) return [url, ""];
  return [url.slice(0, q), url.slice(q + 1)];
}
