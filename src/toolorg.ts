/**
 * Tool organization helpers — parity with agentruntime-mcp-go/toolorg.
 * See docs/mcp/MCP_TOOL_ORGANIZATION.md.
 */

export interface Metadata {
  display_name?: string;
  suggested_group?: string;
  suggested_tags?: string[];
  suggested_rank_key?: string;
}

export interface EffectiveOrganization {
  groupId: string;
  groupLabel: string;
  rankKey: string;
  tags: string[];
}

export interface ToolGroup {
  id: string;
  label: string;
  rankKey: string;
  source?: string;
}

const DEFAULT_GROUP_LABELS: Record<string, string> = {
  hierarchy: "Hierarchy",
  tasks: "Tasks",
  search_members: "Search & members",
  comments: "Comments",
  time: "Time tracking",
  docs: "Docs",
  chat: "Chat",
  uncategorized: "Other",
};

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  out.sort();
  return out;
}

function inferGroupId(body: string): string {
  if (body.includes("chat")) return "chat";
  if (body.includes("doc")) return "docs";
  if (body.includes("comment")) return "comments";
  if (body.includes("time")) return "time";
  if (
    body === "search" ||
    body.includes("member") ||
    body.includes("assignee") ||
    body.includes("filtered_team")
  ) {
    return "search_members";
  }
  if (
    body.includes("workspace") ||
    body.includes("space") ||
    body.includes("folder") ||
    body.includes("hierarchy") ||
    body === "get_list" ||
    body.startsWith("get_lists") ||
    body.startsWith("create_list") ||
    body.startsWith("update_list") ||
    body.startsWith("create_folder") ||
    body.startsWith("update_folder")
  ) {
    return "hierarchy";
  }
  return "tasks";
}

function isReadOnlyVerb(body: string): boolean {
  for (const prefix of ["get_", "list_", "find_", "resolve_", "search"]) {
    if (body.startsWith(prefix) || body === prefix.replace(/_$/, "")) return true;
  }
  return false;
}

function inferTags(body: string, groupId: string): string[] {
  const tags = [groupId];
  tags.push(isReadOnlyVerb(body) ? "read_only" : "mutating");
  tags.push(body.includes("chat") || body.includes("doc") ? "v3" : "v2");
  return normalizeTags(tags);
}

export function suggestFromWireName(toolName: string): { groupId: string; tags: string[] } {
  const name = toolName.trim().toLowerCase();
  const parts = name.split("_");
  if (parts.length < 2) {
    return { groupId: "uncategorized", tags: ["mutating"] };
  }
  const body = parts.slice(1).join("_");
  const groupId = inferGroupId(body);
  return { groupId, tags: inferTags(body, groupId) };
}

export function formatDisplayName(toolName: string): string {
  const parts = toolName.trim().split("_");
  if (parts.length <= 1) return toolName;
  const body = parts.slice(1).join(" ");
  if (!body) return toolName;
  return body[0]!.toUpperCase() + body.slice(1);
}

export function publisherMetadata(
  toolName: string,
  overrides: Metadata = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let display = (overrides.display_name ?? "").trim();
  if (!display) display = formatDisplayName(toolName);
  if (display) out.display_name = display;

  let group = (overrides.suggested_group ?? "").trim().toLowerCase();
  if (!group) group = suggestFromWireName(toolName).groupId;
  if (group) out.suggested_group = group;

  let tags = overrides.suggested_tags ?? [];
  if (tags.length === 0) tags = suggestFromWireName(toolName).tags;
  if (tags.length > 0) out.suggested_tags = tags;

  const rk = (overrides.suggested_rank_key ?? "").trim();
  if (rk) out.suggested_rank_key = rk;
  return out;
}

export function defaultPublisherMetadata(toolName: string): Record<string, unknown> {
  return publisherMetadata(toolName, {});
}

export function groupLabel(groupId: string): string {
  const gid = groupId.trim().toLowerCase();
  if (DEFAULT_GROUP_LABELS[gid]) return DEFAULT_GROUP_LABELS[gid]!;
  return gid
    .split("_")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function normalizeGroupId(id: string): string {
  return id.trim().toLowerCase().replace(/ /g, "_");
}

export function parseMetadata(raw: string | Uint8Array): Metadata {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const tagsRaw = parsed.suggested_tags;
    const tags = Array.isArray(tagsRaw) ? tagsRaw.map(String) : [];
    return {
      display_name: String(parsed.display_name ?? ""),
      suggested_group: normalizeGroupId(String(parsed.suggested_group ?? "")),
      suggested_tags: normalizeTags(tags),
      suggested_rank_key: String(parsed.suggested_rank_key ?? ""),
    };
  } catch {
    return {};
  }
}

export function metadataIsEmpty(meta: Record<string, unknown>): boolean {
  if (!meta || Object.keys(meta).length === 0) return true;
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    if (k === "suggested_tags") {
      if (Array.isArray(v) && v.length > 0) return false;
      continue;
    }
    if (typeof v === "string" && v.trim()) return false;
  }
  return true;
}

export function mergeEffective(
  published: Metadata,
  overlayGroupId?: string | null,
  overlayRankKey?: string | null
): EffectiveOrganization {
  let groupId = (published.suggested_group ?? "").trim();
  const tags = [...(published.suggested_tags ?? [])];
  if (overlayGroupId != null) {
    const g = normalizeGroupId(overlayGroupId);
    if (g) groupId = g;
  }
  let rankKey = (published.suggested_rank_key ?? "").trim();
  if (overlayRankKey != null) {
    const rk = overlayRankKey.trim();
    if (rk) rankKey = rk;
  }
  return {
    groupId,
    groupLabel: groupLabel(groupId),
    rankKey,
    tags,
  };
}
