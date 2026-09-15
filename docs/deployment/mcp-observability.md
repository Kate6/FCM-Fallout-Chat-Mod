# MCP observability runbook

FCM emits newline-delimited Pino JSON to the backend container's standard output. Production must retain these logs in the platform log store for at least the audit-log retention period. In-process MCP counters reset on restart and do not aggregate replicas; structured logs and database audit rows are the operational sources of truth.

Create monitors over parsed JSON fields using these exact conditions:

| Monitor | Query | Window | Severity |
| --- | --- | --- | --- |
| Refresh reuse | `event = "mcp_security_event" AND kind = "refresh_reuse"` | Any hit | Critical |
| Repeated SSRF attempts | count of `event = "mcp_security_event" AND kind = "ssrf_rejection"` | 3 in 5 minutes | High |
| Role-gate failures | count of `event = "mcp_security_event" AND kind = "role_gate_failure"` | 5 in 5 minutes | Medium |
| Mutation error rate | count of `event = "mcp_mutation" AND outcome = "failure"` divided by count of `event = "mcp_mutation" AND outcome IN ("success", "failure", "partial")`; require at least 20 total | More than 20% over 5 minutes | High |
| Audit finalization | message contains `MCP mutation audit finalization failed` | Any hit | Critical |

For the Docker-hosted Dokploy backend, verify JSON ingestion before enabling remote MCP:

```bash
docker logs --since 15m <backend-container> 2>&1 \
  | jq -c 'select(.event == "mcp_security_event" or .event == "mcp_operational_alert" or .event == "mcp_denial" or .event == "mcp_mutation")'
```

Index only the bounded fields `event`, `kind`, `reason`, `tool`, and `outcome`. The `mcp_security_event` record is emitted for every event; `mcp_operational_alert` is only a per-process diagnostic threshold and must not be the aggregation source. Keep correlation, actor, client, grant, and target as searchable payload fields rather than high-cardinality indexes. Grant values are one-way, truncated SHA-256 pseudonyms. Authorization headers, OAuth codes/tokens/secrets, URL credentials/query strings, and image content must never appear.

For incident triage, search by the response's `X-Correlation-ID`, inspect the matching `mcp_denial` or `mcp_mutation` record, and reconcile mutations with the durable database audit row before retrying. An alert reports state only; it does not revoke credentials, message users, or change deployment state.
