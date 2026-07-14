import { describe, expect, it } from "vitest";
import { requestBearerFromContext, runWithRequestBearer } from "./request_bearer.js";

describe("requestBearerFromContext", () => {
  it("returns stored bearer", () => {
    runWithRequestBearer("pat_test_abc", () => {
      expect(requestBearerFromContext()).toBe("pat_test_abc");
    });
  });

  it("empty when not set", () => {
    expect(requestBearerFromContext()).toBe("");
  });
});
