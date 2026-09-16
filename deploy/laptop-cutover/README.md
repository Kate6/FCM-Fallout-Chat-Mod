# Laptop cutover runtime

This stack is the production-equivalent cold-failover runtime for the temporary
Windows laptop host. It does not use `docker-compose.dev.yml`, publish data-store
ports, or join the VPS-only `dokploy-network`. Its connector is an `edge` Compose
profile so all laptop services remain in one Compose project while edge startup
still requires an explicit action.

Use two independent copies with these identities:

| Environment | Compose project | Local origin |
| --- | --- | --- |
| Dev rehearsal | `fcm-cutover-dev` | `127.0.0.1:17676` |
| Production | `fcm-cutover-prod` | `127.0.0.1:27676` |

The unique project names create separate networks and volume namespaces. Never
reuse an env file, backup, checkpoint, or volume between Dev and Production.
Cloudflare must target the environment's laptop-local origin through the approved
connector; it must never target the public hostname. Start the connector with
`docker compose --profile edge up -d cloudflared` only at the approved cutover
boundary and only after proving the source connector and all source writers are
stopped. `docker compose ls` must show exactly one project for the environment;
the project normally contains four services privately, or five while its edge
profile is active.

For a remotely managed tunnel, `TUNNEL_ORIGIN_ALIAS` must exactly match the
hostname in Cloudflare's origin service URL. The current Dev configuration uses
`http://backend-dev:7676`, so the laptop backend must have the `backend-dev`
network alias before its connector starts. HTTP health on the host-local port does
not prove that the connector container can resolve this alias.
Production currently uses
`http://chat-mod-fallout-chat-mod-dprwq2-backend-1:7676`; record that exact value
at preflight and set the laptop Production network alias to its hostname. Do not
shorten it to `backend` unless the Cloudflare configuration is deliberately
changed, snapshotted, and rollback-tested at the approved edge boundary.

Before any start, replace every `REQUIRED` value, pin all images by digest, restore
the Timescale physical/base backup, MinIO objects, downloads, and the approved
Redis policy, then run `docker compose config` without printing its expanded
output. The stack intentionally fails closed when required values are missing.

## Windows/SSH Manager pitfall

The SSH Manager batch deploy cleanup currently emits Unix `rm -f`, which Windows
PowerShell interprets as an ambiguous `Remove-Item -f` parameter. A batch may
therefore report failure after uploading only its first file. On `msi`, transfer
cutover files individually with SSH Manager's direct upload operation, then verify
every remote SHA-256 checksum. Do not assume the batch was atomic or complete.

Removing containers does not remove their named volumes or custom networks. Keep
those artifacts until they are classified; never attach an old rehearsal volume
to a new Dev or Production project merely because its name looks relevant.

Direct SFTP uploads to Windows may create secret files that do not inherit the
restricted parent ACL. After every upload, explicitly set ownership and grant
only the cutover account and `SYSTEM` full control, then prove the SSH account can
read the files before running Compose. Validate imported configuration by key
coverage, empty-value detection, `docker compose config --quiet`, and SHA-256;
never print expanded Compose output because it contains secrets.

Keep connector credentials in `config/edge.env`, separate from
`config/runtime.env`. The backend must not receive a Cloudflare tunnel token.

Docker Desktop's containerd image store may display a different local image ID
after loading a Linux `docker save` archive, and multi-platform pulls may display
the manifest digest where Docker Engine displays the platform config digest.
Do not reject an artifact on that display difference alone: verify the transfer
archive SHA-256 before loading, pin registry images by repository digest, and
record architecture, creation timestamp, and the source container image ID.
If an upstream registry no longer serves a pinned digest (observed with MinIO),
export that exact running image from the authoritative host and checksum the
archive instead of silently pulling `latest`.

## Rehearsal findings (2026-09-14)

The first full Dev transfer exposed the following requirements. Treat each as a
fail-closed checkpoint in future rehearsals and in Production:

- Do not use Dokploy's `composeStatus` as proof that hosted writers are running
  or stopped. During this rehearsal Dokploy continued to report `done` while all
  five hosted Dev containers were exited. Verify the actual backend, bot,
  workers, data stores, and connector with SSH Manager before assigning
  authority. Record both the control-plane status and the container evidence.

- Use an allowed `messages.source` value for SQL sentinels. The schema rejected
  the invented value `cutover_sentinel`; `mcp` is valid for a synthetic cutover
  record. Create all related sentinel rows in one transaction so a rejected row
  cannot leave a partial fixture.
- Allow more than 60 seconds for the backend's graceful shutdown, but verify the
  result. The Dev backend exhausted that window and exited with code 137. Record
  the forced exit, prove all source writers and connectors are stopped, and run
  database/object checks before taking the cold volume copies.
- Windows ACLs that correctly restrict backup ciphertext to the cutover account
  and `SYSTEM` can prevent Docker Desktop's Linux VM from bind-mounting or
  `docker cp`-ing it. Grant `BUILTIN\Users` read access to ciphertext only for
  the copy into a fresh Docker staging volume, immediately remove that grant,
  stream the DPAPI-unprotected key separately, and delete the staging volume as
  soon as restore succeeds. Never loosen the ACL on the key or restored data.
- SSH Manager/Windows operations can hit their effective timeout while a detached
  Docker restore continues. Give every restore an explicit name, inspect its
  exit status and logs, and remove only that known container and its fresh
  staging volume before retrying. Never start a second restore against the same
  target volumes.
- Pre-created restored volumes cause Compose ownership warnings. Declare restored
  volumes as `external: true` in the generated, environment-specific deployment
  override (or apply the expected Compose labels before startup), then verify the
  resolved volume names. A warning must not be ignored in Production because a
  future project-name change could attach an empty volume.
- A `docker save` archive can import with its original source tag (or only an
  image ID), while the cutover `.env` requires environment-specific local tags.
  After every `docker load`, verify the expected `FCM_BACKEND_IMAGE` and
  `MINIO_IMAGE` references resolve locally. Add only local Docker tag aliases
  for the verified imported image; never let Compose pull an unreviewed image
  because a local tag is absent.
- The portable backup `SHA256SUMS` may preserve the source host's absolute
  paths. On a different host, validate each encrypted archive by its basename
  against the manifest hash, record the path-format exception, and fail on any
  missing or mismatched basename. Do not mistake the path prefix difference for
  a successful verification or for archive corruption.
- Before restoring Dev on the mothership, inspect all existing FCM Compose
  projects by Docker labels, not just expected Dev names. A previously running
  Dokploy Production project contained a live backend and Discord bot after
  production had moved to Hostinger. Stop the specifically identified obsolete
  project with `docker compose down` (without `-v`) and prove it is gone before
  starting a replacement environment.
- Treat the `releases_downloads` volume as user-visible production state. The
  release table can retain a valid version and URL while a restored downloads
  volume contains only install scripts, leaving the advertised Windows ZIP or
  installer at HTTP 404. Before declaring a target authoritative, compare each
  currently published release URL with the restored volume, restore the exact
  release artifacts, then verify public HTTP 200, `Content-Length`, and SHA-256
  against the source artifact.
- A remotely managed tunnel resolves its configured origin on the connector's
  Docker network. The backend therefore needs a network alias matching the saved
  origin (`backend-dev` for the current Dev tunnel). Host-local health alone is
  insufficient; require connector count = 1 plus external health.
- A raw WebSocket probe must use a valid random 16-byte `Sec-WebSocket-Key`, HTTP/1.1,
  `Upgrade: websocket`, and an allowed `Origin`. The invalid first probe returned
  400 even though the route was healthy. Require HTTP 101 independently for
  `/ws` and `/relay`.
- Authenticated QA/overlay probes must send `x-client-version` equal to
  `QA_ACTIVE_VERSION`. Without it, the backend accepted the upgrade and then
  correctly closed the stale client. The cutover acceptance test must perform a
  hosted Dev persona login, send a real `chat:send`, observe its `chat:message`
  echo, prove exactly one database row persisted, and verify the same marker in
  the configured Dev Discord channel.
- Validate every optional Discord subsystem separately. The first start exposed
  an empty `DISCORD_EVENTS_CHANNEL_ID`; resolve the intended channel from the
  environment's own Discord guild, save it in both Dokploy and the laptop
  runtime, restart the authoritative backend, and prove the bot can read the
  channel. Never copy a Dev guild ID into Production. For this rehearsal the Dev
  `events` channel was resolved and validated after the core chat relay passed.
- Keep the connector in the same Compose project under the `edge` profile. A
  separately launched connector appears as a second Docker Desktop group and is
  easier to omit during shutdown. The imported credential was named
  `CLOUDFLARE_TUNNEL_TOKEN`, while cloudflared itself reads `TUNNEL_TOKEN`; normalize
  that key in `config/edge.env` before enabling the profile. A mismatched key
  makes cloudflared restart with exit code 255 and produces an external 530.
- A push to `dev` can trigger both destinations. Dokploy's GitHub App currently
  has `autoDeploy=true` for `fcm-dev-stack`, so pushing the laptop workflow while
  the VPS stack is stopped would restart hosted Dev and violate single-writer
  operation. Disable hosted Dev auto-deploy before enabling laptop auto-deploy;
  reverse those gates during failback. Verify the saved flags immediately before
  every push during a cutover window.
- The connected Dokploy MCP can read a Compose service, save its environment,
  and redeploy it, but it does not expose the Compose `autoDeploy` mutation.
  `application_update(autoDeploy=...)` applies only to Dokploy Applications and
  must not be used against a Compose ID. Until that MCP capability exists, this
  flag is an explicit Dokploy UI checkpoint; do not substitute a direct database
  edit or an undocumented shell/API call.

The 2026-09-14 Dev laptop cutover passed private health, external HTTP, `/ws` and
`/relay` upgrades, hosted Dev persona authentication, live message echo,
database persistence, and Discord chat relay. Raw TCP HUD transport remains a
separate approval item and is not proven by these HTTP/WebSocket checks.

## Dev branch auto-deploy

The laptop mirrors Dokploy's push-triggered Dev behavior through
`.github/workflows/deploy-laptop-dev.yml`. A trusted push to `dev` targets only a
Windows self-hosted runner labeled `fcm-laptop-dev`. The job builds the same
`backend/Dockerfile`, updates only the laptop backend image, leaves Postgres,
Redis, MinIO, and the tunnel running, checks localhost health, and restores the
previous image automatically if validation fails.
If candidate health validation fails, the workflow records the candidate backend
status and its last 200 log lines before restoring the previous image. This keeps
startup failures diagnosable without weakening the automatic rollback.
The backend image also normalizes `baseline-migrations.sh` to LF during its Docker
build. Windows Git checkouts may otherwise preserve a CRLF shebang that Alpine
reports misleadingly as `baseline-migrations.sh: not found` during startup.

Two independent gates must both be enabled:

1. Repository variable `LAPTOP_DEV_AUTODEPLOY=true`. Set it to `false` before
   failback so GitHub does not queue work for an offline laptop runner.
2. Empty marker file `C:\FCM\cutover\dev\CUTOVER_ACTIVE`. Remove it before
   restoring VPS authority; the deployment script exits without changing Docker
   when the marker is absent.

Install the runner from an elevated PowerShell prompt with
`install-github-runner.ps1`. Generate a short-lived registration token at
GitHub **Settings → Actions → Runners → New self-hosted runner** and pass it only
to that interactive command; do not save it in `.env`, chat, shell history, or
the repository. The runner service uses a dedicated label and the workflow has
read-only repository permissions plus a serialized deployment concurrency key.
The Windows service defaults to `NETWORK SERVICE`; the installer grants that
identity only traversal on `C:\FCM`, modify access to the runner and Dev cutover
trees, and membership in `docker-users`. Without those grants the registered
runner exits because the hardened `C:\FCM` ACL denies directory traversal.
The deployment workflow uses a process-scoped PowerShell execution-policy bypass
for GitHub's temporary step wrapper. This leaves the machine's persisted policy
unchanged while allowing the signed-in runner service to execute the checked-out
deployment script.
SSH Manager may time out while the runner archive downloads and configuration
continues in the background. After a timeout, inspect `.runner`, the Windows
service, GitHub's runner status, and the one-time token file before retrying.
Never register a duplicate runner. Delete the local and remote registration-token
files immediately after configuration; the runner's long-lived credential stays
inside its protected installation directory.

### Auto-deploy authority switch

| Authority | Dokploy `autoDeploy` | `LAPTOP_DEV_AUTODEPLOY` | Laptop marker |
| --- | --- | --- | --- |
| Hosted Dev | `true` | `false` | absent |
| Laptop Dev | `false` | `true` | present |
| Transition/frozen | `false` | `false` | absent |

Never allow both auto-deploy flags to be true. A successful container stop does
not disable Dokploy's GitHub trigger, and an offline runner does not make a true
laptop flag safe because GitHub can queue the deployment until it reconnects.

## Production readiness snapshot (2026-09-14)

Production was prepared read-only; no backup, writer stop, restart, deployment,
tunnel change, or public-route change was performed. The authoritative VPS
backend, Timescale/Postgres, Redis, and MinIO remained healthy and the external
health endpoint passed after preparation.

Laptop Production state:

- `C:\FCM\cutover\prod` is isolated from Dev and resolves as Compose project
  `fcm-cutover-prod` with localhost-only origin `127.0.0.1:27676`.
- All 45 keys stored in the Dokploy Production environment are present in the
  laptop runtime with the same empty/non-empty policy. Twelve additional runtime
  and container-routing keys are laptop-specific. Secret values were not logged.
- The exact running Production backend image was transferred via a checksummed
  Docker archive, loaded as `fcm-cutover-prod-backend:fdbc314d2b8a`, and its
  architecture, creation timestamp, command, and entrypoint match the source.
  Docker Desktop changed the local image ID after import, as already documented.
- Production-equivalent Timescale, Redis, MinIO, and cloudflared artifacts are
  present and pinned. The Production tunnel token is stored only in the
  restricted `config\edge.env`; all plaintext transit copies were destroyed.
- Cloudflare tunnel `falloutchatmod` remained remotely managed and healthy at
  configuration version 3. Its origin hostname is the full current VPS container
  name, so the laptop backend is configured with that exact Docker network alias.
- `docker compose --profile edge config --quiet` passes and zero
  `fcm-cutover-prod` containers exist. The stack must remain stopped until the
  Production destructive-boundary approval.
- The machine-readable, secret-free record is
  `C:\FCM\cutover\prod\checkpoints\preflight.json`.

Still blocking an actual Production cutover: scheduled window/timezone, outage
budget, raw TCP HUD decision, Redis continuity policy, fresh encrypted backups,
source quiescence proof, and explicit approval at the cutover boundary.
