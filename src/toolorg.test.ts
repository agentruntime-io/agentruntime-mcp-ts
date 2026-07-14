import { describe, expect, it } from "vitest";
import suggestCases from "./toolorg.fixtures.json" with { type: "json" };
import {
  defaultPublisherMetadata,
  mergeEffective,
  suggestFromWireName,
} from "./toolorg.js";

describe("suggestFromWireName fixtures", () => {
  for (const tc of suggestCases) {
    it(tc.tool_name, () => {
      const { groupId, tags } = suggestFromWireName(tc.tool_name);
      expect(groupId).toBe(tc.group);
      expect(tags).toEqual(tc.tags);
    });
  }
});

describe("defaultPublisherMetadata fixtures", () => {
  for (const tc of suggestCases) {
    it(tc.tool_name, () => {
      const meta = defaultPublisherMetadata(tc.tool_name);
      expect(meta.suggested_group).toBe(tc.group);
    });
  }
});

describe("mergeEffective explicit-only", () => {
  it("overlay wins", () => {
    const eff = mergeEffective({}, "docs", "n");
    expect(eff.groupId).toBe("docs");
    expect(eff.rankKey).toBe("n");
  });

  it("published group", () => {
    const eff = mergeEffective({ suggested_group: "tasks" });
    expect(eff.groupId).toBe("tasks");
  });

  it("empty publish metadata", () => {
    const eff = mergeEffective({});
    expect(eff.groupId).toBe("");
    expect(eff.tags).toEqual([]);
  });
});
