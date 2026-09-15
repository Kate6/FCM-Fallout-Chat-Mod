# Production MCP rollout and rollback

The remote FCM MCP is a production-only administrative surface. Shipping the
code does not enable it: `MCP_REMOTE_ENABLED` defaults to `false`, and the
backend additionally requires `NODE_ENV=production`. Never enable it on the
hosted development stack.

## Before enabling

1. Deploy with `MCP_REMOTE_ENABLED=false`. The normal baseline runs authoritative
   `prisma db push`, then the required idempotent post-push patches that install
   embed-asset state/lease and MCP OAuth S256/scope constraints, before it
   reconciles migration history. Confirm those constraints exist and the
   dashboard, Discord bot, and existing local-dev MCP remain healthy.
2. Configure explicit HTTPS `MCP_ISSUER_URL` and `MCP_RESOURCE_URL`, a non-empty
   exact `MCP_ALLOWED_ORIGINS` list, and a unique 32-byte-or-longer
   `MCP_OAUTH_STATE_SECRET`. Keep access tokens at 600 seconds and refresh/grant
   lifetime at 259200 seconds (72 hours absolute).
3. Verify structured MCP logs are retained and alerts from
   [MCP observability](mcp-observability.md) reach the on-call operator.
4. Run backend tests, Prisma validation/schema push, standalone MCP contracts,
   dashboard Vitest, and `npm run test:mcp-inspector` in the label-gated CI run.
5. Confirm the Discord bot can send embeds, add reactions, and manage only the
   intended assignable roles. Confirm the embed asset bucket and public FCM
   origin are configured.

## Canary sequence

Enable the switch during a staffed window. The authorization service admits
only current owners, admins, and dual-guild developers; moderators, QA,
supporters, ordinary members, banned users, and users with a removed role fail
closed.

1. Owner canary: complete discovery, PKCE login and consent; list tools; read
   Discord context; preview/import/save/send an embed; create and deactivate a
   custom-emoji reaction-role panel; refresh; revoke; then verify the revoked
   grant is denied.
2. Remove the canary's qualifying role temporarily and verify the next request
   is denied within the role cache's five-minute maximum. Restore it only after
   the denial is recorded.
3. Expand to admins and observe for seven days. Resolve every authentication,
   SSRF/media, audit-finalization, Discord, or mutation alert before proceeding.
4. Expand to dual-guild developers and observe for another seven days. Publish
   the supported client setup internally only after this stage is healthy.
5. Retain the legacy bridge for at least 30 successful production days. Disable
   new legacy token minting only after direct user notice and verified OAuth
   replacement; revoke remaining personal keys separately.

Each deployment automatically publishes its current tool registry through
`tools/list`; clients reconnect to discover additions or definition changes.
There is no production tool allowlist or client package to update separately.

## Incident response and rollback

Set `MCP_REMOTE_ENABLED=false` first. This immediately blocks new OAuth work and
protected MCP access without disabling dashboard or Discord bot routes. Revoke
affected grant families, rotate `MCP_OAUTH_STATE_SECRET` if state integrity may
be compromised, and rotate any adjacent Discord/object-store credential only if
evidence shows exposure. Preserve OAuth rows, mutation audits, correlation logs,
and imported asset metadata for investigation; do not delete Discord messages or
objects as part of the initial containment.

Search logs by `X-Correlation-ID`, reconcile any uncertain mutation with its
durable audit row and Discord/object-store state, and avoid retrying a partial
send until the returned message ID has been inspected. Re-enable only after the
root cause is fixed, CI and Inspector checks pass, affected grants are revoked,
and the owner canary succeeds again.
