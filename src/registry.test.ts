import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import {
  tool,
  heldToolNames,
  registeredToolNames,
  getPublishableRegistry,
  resetRegistry,
} from "./registry.js";

describe("tool hold", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("tracks held vs publishable tools", () => {
    tool({
      name: "pub_tool",
      inputSchema: z.object({}),
      execute: () => ({}),
    });
    tool({
      name: "held_tool",
      hold: true,
      inputSchema: z.object({}),
      execute: () => ({}),
    });

    expect(registeredToolNames()).toEqual(["pub_tool", "held_tool"]);
    expect(heldToolNames()).toEqual(["held_tool"]);
    expect(getPublishableRegistry().map((entry) => entry.name)).toEqual(["pub_tool"]);
  });
});
