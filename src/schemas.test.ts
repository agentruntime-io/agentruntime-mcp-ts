import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitJsonShape } from "./schemas.js";

describe("emitJsonShape", () => {
  it("emits enum and explicit default from Zod", () => {
    const schema = z.object({
      mode: z.enum(["fast", "accurate"]),
      limit: z.number().int().min(1).max(100).default(30),
      note: z.string().optional(),
    });

    const shape = emitJsonShape(schema);
    const props = shape.properties as Record<string, Record<string, unknown>>;

    expect(props.mode.enum).toEqual(["fast", "accurate"]);
    expect(props.limit.default).toBe(30);
    expect(props.note.default).toBeUndefined();
  });
});
