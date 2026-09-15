import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import * as devChannels from "../dev/tools/channels.js";
import * as devHealth from "../dev/tools/health.js";
import * as devMessages from "../dev/tools/messages.js";
import * as devParties from "../dev/tools/parties.js";
import * as devReleases from "../dev/tools/releases.js";
import * as devSim from "../dev/tools/sim.js";
import * as devWiki from "../dev/tools/wiki.js";
import * as devWs from "../dev/tools/ws.js";
import { prodMutationNames, prodReadNames } from "./fixtures/prodLegacyCatalog.fixture.js";

type ToolDefinition = {
  name: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

function definitions(module: Record<string, unknown>): ToolDefinition[] {
  return Object.entries(module)
    .filter(([name]) => name.endsWith("Def"))
    .map(([, value]) => value as ToolDefinition)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, normalize(nested)]));
  }
  return value;
}

function schemaDigests(toolDefinitions: ToolDefinition[]): Array<[string, string]> {
  return toolDefinitions.map(({ name, inputSchema }) => [name, createHash("sha256").update(JSON.stringify(normalize(inputSchema))).digest("hex")]);
}

const devDefinitions = definitions({
  ...devChannels,
  ...devHealth,
  ...devMessages,
  ...devParties,
  ...devReleases,
  ...devSim,
  ...devWiki,
  ...devWs,
});

test("legacy development tool names remain stable", () => {
  assert.deepEqual(devDefinitions.map(({ name }) => name), [
    "fcm_camp_search",
    "fcm_channels_list",
    "fcm_commands_list",
    "fcm_health_get",
    "fcm_messages_list",
    "fcm_messages_send",
    "fcm_parties_list",
    "fcm_releases_list",
    "fcm_sim_stream_start",
    "fcm_sim_users_create",
    "fcm_users_search",
    "fcm_version_get",
    "fcm_wiki_search",
    "fcm_ws_count",
    "fcm_ws_snapshot",
  ]);
});

test("legacy production read tool names remain stable", () => {
  assert.deepEqual([...prodReadNames], [
    "fcm_audit_log_list",
    "fcm_bans_list",
    "fcm_camp_search",
    "fcm_channels_list",
    "fcm_commands_list",
    "fcm_community_stats",
    "fcm_health_get",
    "fcm_messages_list",
    "fcm_messages_search",
    "fcm_moderation_settings",
    "fcm_name_blacklist_list",
    "fcm_parties_list",
    "fcm_releases_list",
    "fcm_reports_list",
    "fcm_users_get",
    "fcm_users_list",
    "fcm_users_search",
    "fcm_version_get",
    "fcm_wiki_search",
    "fcm_ws_count",
    "fcm_ws_snapshot",
  ]);
});

test("legacy production mutation names and confirmation schemas remain stable", () => {
  assert.deepEqual([...prodMutationNames], [
    "fcm_bans_create",
    "fcm_bans_reverse",
    "fcm_channels_archive",
    "fcm_channels_create",
    "fcm_channels_update",
    "fcm_commands_create",
    "fcm_commands_delete",
    "fcm_commands_update",
    "fcm_kicks_create",
    "fcm_messages_delete",
    "fcm_messages_send",
    "fcm_mutes_create",
    "fcm_mutes_delete",
    "fcm_name_blacklist_add",
    "fcm_name_blacklist_remove",
    "fcm_releases_create",
    "fcm_reports_resolve",
  ]);

});

test("every legacy development input schema remains stable", () => {
  assert.deepEqual(schemaDigests(devDefinitions), [
    ["fcm_camp_search", "7316a9e2450de63e958144828c903daac08088d1bc74a6a7aa3dda9c434ccc09"], ["fcm_channels_list", "c8a1ac469a826ea3547ac220c7bbfdcd6b58080d4ec596ff2a0149c5ccb9b699"], ["fcm_commands_list", "c8a1ac469a826ea3547ac220c7bbfdcd6b58080d4ec596ff2a0149c5ccb9b699"], ["fcm_health_get", "c8a1ac469a826ea3547ac220c7bbfdcd6b58080d4ec596ff2a0149c5ccb9b699"], ["fcm_messages_list", "1fd4e9297c51c31787b9c6a4d771c0f613d0238ce72fc5b859722f95db1c5842"], ["fcm_messages_send", "2fae9a344e174eec3ad149731d76f0ce796d26dc1d7b49e3154b785e29641d7a"], ["fcm_parties_list", "c8a1ac469a826ea3547ac220c7bbfdcd6b58080d4ec596ff2a0149c5ccb9b699"], ["fcm_releases_list", "c8a1ac469a826ea3547ac220c7bbfdcd6b58080d4ec596ff2a0149c5ccb9b699"], ["fcm_sim_stream_start", "326736297ff3f9252b0a16ed058fa7555dd76497028211dd3fcc974f464998d8"], ["fcm_sim_users_create", "ceed4af80175c4e6657105d217e2165bed1bb2f64d751dcfe120178cef94ce42"], ["fcm_users_search", "7316a9e2450de63e958144828c903daac08088d1bc74a6a7aa3dda9c434ccc09"], ["fcm_version_get", "c8a1ac469a826ea3547ac220c7bbfdcd6b58080d4ec596ff2a0149c5ccb9b699"], ["fcm_wiki_search", "7316a9e2450de63e958144828c903daac08088d1bc74a6a7aa3dda9c434ccc09"], ["fcm_ws_count", "c8a1ac469a826ea3547ac220c7bbfdcd6b58080d4ec596ff2a0149c5ccb9b699"], ["fcm_ws_snapshot", "c8a1ac469a826ea3547ac220c7bbfdcd6b58080d4ec596ff2a0149c5ccb9b699"],
  ]);
});

test("development mutation handlers also refuse execution without explicit confirmation", async () => {
  for (const handler of [devMessages.messagesSendHandler, devSim.simStreamStartHandler, devSim.simUsersCreateHandler]) {
    const result = await handler({ confirm: false });
    assert.deepEqual(Object.keys(result), ["content"]);
    assert.equal(result.content[0]?.type, "text");
    assert.match(result.content[0]?.text ?? "", /not confirmed/i);
  }
});

test("representative development handlers preserve the text JSON result envelope", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env["FCM_MCP_TOKEN"];
  process.env["FCM_MCP_TOKEN"] = "development-contract-test-token";
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { fixture: true } }), { status: 200, headers: { "content-type": "application/json" } });
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env["FCM_MCP_TOKEN"];
    else process.env["FCM_MCP_TOKEN"] = originalToken;
  });
  const results = await Promise.all([
    devHealth.healthGetHandler({}),
    devMessages.messagesSendHandler({ channelId: "channel", content: "message", confirm: true }),
  ]);
  for (const result of results) assert.deepEqual(result, { content: [{ type: "text", text: "{\n  \"fixture\": true\n}" }] });
});

test("the pinned SDK protocol compatibility set is recorded", () => {
  assert.deepEqual(SUPPORTED_PROTOCOL_VERSIONS, [
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
    "2024-10-07",
  ]);
});
