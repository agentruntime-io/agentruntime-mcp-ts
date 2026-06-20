import { describe, expect, it } from "vitest";
import {
  applyAuthMapping,
  applyBridgeHeaders,
  applyHeaderMappings,
} from "./bridge_auth.js";

describe("applyAuthMapping", () => {
  it("sets bearer Authorization", () => {
    const h = applyAuthMapping({ access_token: "tok123" }, {
      type: "bearer",
      from: "access_token",
    });
    expect(h.Authorization).toBe("Bearer tok123");
  });

  it("returns empty for type none", () => {
    expect(applyAuthMapping({}, { type: "none" })).toEqual({});
  });
});

describe("applyHeaderMappings", () => {
  it("maps Grafana headers", () => {
    const h = applyHeaderMappings(
      {
        grafana_url: "https://acme.grafana.net",
        service_account_token: "glsa_xxx",
      },
      [
        { name: "X-Grafana-URL", from: "grafana_url" },
        { name: "X-Grafana-Service-Account-Token", from: "service_account_token" },
      ]
    );
    expect(h["X-Grafana-URL"]).toBe("https://acme.grafana.net");
    expect(h["X-Grafana-Service-Account-Token"]).toBe("glsa_xxx");
  });

  it("errors on missing config key", () => {
    expect(() =>
      applyHeaderMappings({}, [{ name: "X-Grafana-URL", from: "grafana_url" }])
    ).toThrow(/grafana_url/);
  });
});

describe("applyBridgeHeaders", () => {
  it("combines auth none with header_mappings", () => {
    const h = applyBridgeHeaders(
      {
        grafana_url: "https://acme.grafana.net",
        service_account_token: "glsa_xxx",
      },
      {
        auth_mapping: { type: "none" },
        header_mappings: [
          { name: "X-Grafana-URL", from: "grafana_url" },
          { name: "X-Grafana-Service-Account-Token", from: "service_account_token" },
        ],
      }
    );
    expect(h["X-Grafana-URL"]).toBe("https://acme.grafana.net");
  });

  it("supports legacy auth_mapping only", () => {
    const h = applyBridgeHeaders(
      { access_token: "tok" },
      { auth_mapping: { type: "bearer", from: "access_token" } }
    );
    expect(h.Authorization).toBe("Bearer tok");
  });
});
