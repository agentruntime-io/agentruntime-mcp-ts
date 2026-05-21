/**
 * Mode B signed ingress — mirror agentruntime-mcp-go webhook.go
 */
import * as crypto from "node:crypto";

export function signModeB(signingSecret: string, body: Buffer | Uint8Array, unix: number): string {
  const mac = crypto.createHmac("sha256", Buffer.from(signingSecret, "utf8"));
  mac.update(`${unix}.`);
  mac.update(body);
  const digest = mac.digest("hex");
  return `t=${unix},v1=${digest}`;
}

export interface ModeBRequest {
  bffBaseURL: string;
  subscriptionID: string;
  signingSecret: string;
  idempotencyKey: string;
  body: Buffer | Uint8Array;
  contentType?: string;
}

export async function deliverModeB(req: ModeBRequest): Promise<Response> {
  const { bffBaseURL, subscriptionID, signingSecret, idempotencyKey, body } = req;
  if (!bffBaseURL || !subscriptionID || !signingSecret || !idempotencyKey) {
    throw new Error(
      "agentruntime-mcp DeliverModeB: bffBaseURL, subscriptionID, signingSecret, and idempotencyKey are required"
    );
  }

  const ct = req.contentType?.trim() || "application/json";
  const unix = Math.floor(Date.now() / 1000);
  const sig = signModeB(signingSecret, body, unix);
  const url = `${bffBaseURL.replace(/\/$/, "")}/v1/inbound-webhooks/${subscriptionID}`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": ct,
      "Idempotency-Key": idempotencyKey,
      "X-Agentruntime-Signature": sig,
    },
    body: Buffer.from(body),
  });
}
