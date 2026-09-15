# FCM MCP Server

FCM provides a hosted, production-only Streamable HTTP MCP endpoint at
`https://falloutchatmod.com/mcp`. It uses OAuth authorization code + PKCE S256.
Access tokens default to 10 minutes and are capped at 15 minutes. Rotating
refresh tokens keep the grant usable for an absolute maximum of 72 hours;
rotation never extends that deadline.

## Production setup

Point an OAuth-capable client at the hosted URL. Do not build this package or
paste a bearer token for normal production use. Clients discover authorization
metadata at `/.well-known/oauth-protected-resource/mcp` and
`/.well-known/oauth-authorization-server`, then authenticate through Discord.
Public clients use Client ID Metadata Documents (CIMD) or strict dynamic client
registration.

- [Claude Code](clients/claude-code.md)
- [Codex](clients/codex.md)
- [Antigravity](clients/antigravity.md)

Only current FCM owners, admins, and developers with the required role in both
the production and development Discord guilds can connect. Moderator, QA,
supporter, and ordinary-member roles do not grant MCP access. Consent uses the
least requested subset of `fcm:read`, `fcm:discord:write`, and
`fcm:moderation:write`. The server rechecks bans and qualifying roles on
protected requests.

The hosted server is disabled unless production is explicitly configured with
`MCP_REMOTE_ENABLED=true`. It is unavailable in hosted development and test.
See [OAuth and server configuration](../docs/backend/mcp-oauth.md) and the
[production rollout runbook](../docs/deployment/mcp-rollout.md).

## Hosted tools

- `fcm_discord_context_get`: current text channels, assignable roles, and custom
  emojis with stable snowflake IDs.
- `fcm_embeds_list`, `fcm_embeds_get`, `fcm_embed_preview`: read and validate
  embed templates.
- `fcm_embeds_create`, `fcm_embeds_update`, `fcm_embeds_delete`: manage saved
  templates.
- `fcm_embed_asset_import`: validate an HTTPS image, store it in FCM's object
  store, and return an immutable public FCM URL.
- `fcm_asset_upload`: upload base64 file bytes directly. PNG, JPEG, WebP, GIF,
  PDF, UTF-8 text, CSV, and JSON are accepted up to 10 MiB. Non-images are
  always served as sandboxed downloads rather than executable same-origin content.
- `fcm_embeds_send`: send an embed and optionally create a custom-emoji or
  Unicode reaction-role panel.
- `fcm_reaction_role_panels_list`, `fcm_reaction_role_panels_delete`: inspect or
  deactivate panels while preserving their Discord messages.
- `fcm_actions_search`, `fcm_action_read`, `fcm_action_write`: discover and run
  the bounded legacy/long-tail catalog, including the complete moderation
  surface (users/messages, reports, bans/evidence, filters, settings, relay
  mappings, AutoMod rules/violations, and audit records). Read and write dispatch stay separate;
  no arbitrary method, path, or upstream URL is accepted.

Read operations require `fcm:read`. Embed, asset, send, and panel mutations
require `fcm:discord:write` and literal `confirm: true`. Moderation catalog
mutations require `fcm:moderation:write` and confirmation.

The catalog version is derived automatically from registered tool definitions.
Every connection builds `tools/list` from the deployed registry, so additions
and schema changes appear after a client reconnect without updating this npm
package or synchronizing a second production allowlist.

Publishing overlay releases is intentionally excluded. The release runbook's
smoke and completed VirusTotal gates remain a manual, fail-closed workflow.

## Local development

The development stdio server is unchanged and operates only against a local or
hosted-dev environment:

```bash
cd mcp
npm ci
npm run build
export FCM_MCP_TOKEN=<development-token>
node dist/dev/index.js
```

Mint only a development token from the dev dashboard. Never commit tokens.

## Deprecated production stdio bridge

`dist/prod/index.js` is retained temporarily for stdio-only hosts. It is a
transparent bridge: every `tools/list` and `tools/call` goes to the hosted OAuth
server, so it has no independent production tool registry.

Set `FCM_MCP_OAUTH_HELPER` to a JSON argument array for a trusted executable
that reads OAuth credentials from the OS keychain and prints JSON such as
`{"access_token":"...","expires_at":1789400000}`. The bridge invokes it with
`shell:false`, caps runtime/output, never logs its output, caches only the short
access token, and retries once after HTTP 401 so the helper can rotate the
refresh token. Example:

```bash
export FCM_MCP_OAUTH_HELPER='["fcm-oauth-keychain","token"]'
node dist/prod/index.js
```

`FCM_MCP_REMOTE_URL` may override the hosted URL and must be HTTPS except on
loopback. `FCM_MCP_TOKEN` is not accepted by the production bridge.

Intentional compatibility differences:

- Hosted OAuth scopes are enforced in addition to confirmation.
- Remote failures use MCP error results instead of legacy REST envelopes.
- Release publishing is absent because its external safety gates cannot be
  represented by a generic action.
- The bridge mirrors the current hosted tool list, not the frozen list compiled
  into historical package versions.

## Related infrastructure MCP

Failover edge operations use the official Cloudflare API MCP at
`https://mcp.cloudflare.com/mcp`. Its credentials remain in the operator's OS
keyring; see [Codex client setup](clients/codex.md).
