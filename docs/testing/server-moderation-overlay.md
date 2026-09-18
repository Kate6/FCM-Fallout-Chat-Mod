# Server moderation and overlay usability candidate

Local candidate verification, 2026-09-18. No deployment, installation, commit or
publication is part of this change.

## Acceptance contract

- Regular accounts retain ordinary membership and the `Server` label.
- Staff see `Your server` for their confirmed room and `Server · N` for other
  rooms in the desktop combined feed. Numbers are temporary display identifiers,
  not credentials or alternate room membership keys.
- The HUD changes only its own-room label; it never subscribes to cross-room data.
- Desktop muting is account/environment-local, reversible and cosmetic.
- Unread dots apply to unseen live messages, not self messages, duplicates or
  history. Reduced motion disables pulsing.
- The selected community sub-tab never receives a dot, including while hidden;
  every selection path clears it. Appearance can disable dots (default enabled).
- Staff Server history pages load automatically into General without additional
  buttons. The standard header-menu Refresh restarts both community and Server
  history. Sequential 5.5-second page requests respect backend rate limits;
  rolling history/live buffers remain bounded at 500 messages each.
- Backend-confirmed expired muted rooms are removed from local Unmute preferences;
  quiet occupied rooms survive. Expiry controls reject unauthenticated, oversized
  and malformed requests, and suppress responses after revocation. Redis tests
  exercise fresh, expired and missing activity records; Electron verifies the
  Unmute entry and persisted preference disappear after confirmation.
- Appearance pixel sizing returns native applied dimensions and uses the existing
  SET POS storage. Linux compositor acknowledgment is asynchronous: Apply waits
  briefly before returning geometry instead of persisting the previous size.

## Security review

The staff stream is read-only and desktop-session-only. Server-side checks use
the current session, account ban/kick state and stored staff role, before and
after asynchronous reads. Client-provided roles and room identifiers grant no
authority. Socket disposal, subscription epochs and denial clear privileged
delivery; ordinary room assignment, sending and HUD authentication are unchanged.

History uses socket-issued cursors and bounded pages (ten rooms, fifty messages
per room). Subscription/history requests are rate limited. Live delivery queues
are bounded at 128 and fail closed to an explicit unavailable state; canonical
message IDs deduplicate ordinary and privileged delivery.

Residual limitations: Discord role changes reach the stored role through the
existing five-minute sync, which retains roles on transient fetch failure. Once
the database role changes, delivery revalidates and idle subscriptions are checked
within thirty seconds. This is not instantaneous Discord revocation. Roster
evidence is still client-originated, not tamper-proof world attestation.

Authorization favors safety over minimum database calls: live staff delivery
performs two authorization passes. Large staff populations/high message rates
need workload measurements before claiming negligible backend overhead. No native
game CPU or timing guarantees are inferred from simulator results.

## Reproducible verification

- Backend TypeScript unit runner: authorization, connection lifecycle, handler
  wiring and existing shared-room/provider regressions. The Redis integration
  also runs against disposable Redis; CI enables it with
  `FCM_MODERATION_REDIS_TEST=1`.
- Dashboard: `npx vitest run` and `npx tsc --noEmit`.
- Overlay: `npm run test:unit`, `npx tsc --noEmit`, `npm run build:renderer`, then
  `xvfb-run -a -s '-screen 0 1920x1080x24' npm run test:interaction` on Linux.
- Windows: run `scripts/usability-smoke.mjs` with `FCM_TEST_EXECUTABLE` pointing
  at an isolated native packaged build. The harness creates/removes a temporary
  profile and fixture relay; it does not use saved user authentication.
- HUD: pure Haxe/source/package checks plus the complete simulator Playwright
  suite, including both-provider regular/staff/revoked label assertions.

The Electron fixture explicitly shows its own test window and supplies renderer
game-state/own-room confirmation fixtures with the game closed. This validates
UI behavior, not native provider discovery or production authorization. It does
not weaken the shipping game-presence or bridge-confirmation gates.

The unread/automatic-history regression also checks multi-room accumulation,
cursor progression and denial cancellation, click/keyboard clearing, saved unread
preferences, absence of standalone Server history controls, and actual dropdown
Refresh resubscription and automatic history replay. Run native Windows animation
checks with the game closed: a concurrent game can starve compositor samples.

Manual two-client game acceptance and hosted rollout remain separate, pending
authorization. Do not describe local fixture success as production deployment.

Local results: 453 dashboard tests and 1,242 overlay tests passed, both TypeScript
checks passed, and the backend runner passed 468 tests (one opt-in Redis test
skipped there and passed separately against disposable Redis). All 56 Ruffle
tests passed. The complete Linux Electron interaction run passed with zero
renderer errors, including three numeric Apply/SET POS/restore cycles, ten relay
disconnects, moderator labels/muting/revocation, unread dots and emoji rendering.
The native packaged Windows interaction run also passed all these checks with
zero renderer errors. Temporary profiles, fixture relays and owned Electron
processes were removed automatically; the one-off Windows scheduled task was
unregistered. Staged test artifacts remain separate from the installed overlay.

## Authorized local installation — 2026-09-18

Following the user's separate installation request, the MSI laptop portable EXE
was replaced and launched from its existing Downloads location. Saved FCMData was
preserved and backed up. Startup reports the portable root and authenticated state,
with no fatal startup errors; Fallout 76 was closed. Installed EXE SHA-256:
`fedb58033afe4ce0f6c02468917269ffaa8dc3511a1135d38b9da387fcf74cd5`.
Backup: `C:\Users\White\FCM-overlay-backup-portable-20260917\before-server-features-20260918`.

The desktop visible HUD archive was replaced after another full 56-test Ruffle
pass and Haxe/source/package/SWF checks. Decoded SWF equality and installed archive
equality were verified. Installed BA2 SHA-256:
`8ac74a432a7b66369dc7e7c16237804828c45075278217e85b9427bbf7cf649a`.
Game-root backup: `.extender-backups/before-staff-hud-20260918-PVFoBZ`.
Existing xScal, Prod endpoint, credentials, keybinds, loader registration and
configuration remain unchanged. The HUD version string remains 2.10.110; the hash
identifies this local candidate. These installs do not establish native acceptance.

No hosted backend deployment occurred. Cross-room staff visibility requires the
compatible backend deployment and cannot be accepted solely from these installs.

### Hosted CI test-isolation correction

PR #544 exposed a delayed rejection from the Discord mapping Jest suite: its
logger mock lacked `__esModule`, so esbuild default-import interop hid `warn`.
A direct presence-flush regression reproduced the exact failure. The suite now
uses the correct mock shape, an unavailable Redis fixture instead of a real
connection, and clears intervals created during its imports. Production presence
behavior is unchanged; this prevents the suite's background work leaking into
later tests.

### Unread and automatic Server-history follow-up — 2026-09-18

455 dashboard tests, 1,243 overlay tests and both TypeScript checks passed.
Complete Linux Electron and native packaged Windows UI suites passed, including
automatic multi-room history and the existing dropdown Refresh. Fixture profiles,
relay servers and owned test processes were torn down automatically.

Under separate user authorization, the local Prod-targeted desktop AppImage and
laptop portable overlay were replaced and launched, preserving settings. The
desktop original is recoverable from `Fallout Chat Mod.AppImage.before-unread-20260918`
beside the installed AppImage. The laptop EXE and FCMData backup is
`C:\Users\White\FCM-overlay-backup-portable-20260917\before-unread-fix-20260918`.
Final desktop SHA-256: `8f030ab214bca440e0f69ffd53cec350bd9b834f495a86897f6d4d0bb2f14291`.
Final portable SHA-256: `b6f781f8adfdebcb958ba97e72b1df05609699cee69d9882116b4f724f9c3900`.
These are local 1.4.0 test builds, not a published release; no HUD or backend
change, commit, push or deployment was made in this follow-up.

### Expired-room mute cleanup (not deployed)

The additive authenticated expiry control requires a compatible backend and
overlay. Previously installed 1.4.0 test builds above do not contain this later
change. Retained room activity expires after one hour; occupied-room keepalives
preserve it. The overlay polls only its bounded mute list every 30 seconds while
staff access is ready. It removes expired preferences and corresponding cached
moderation rows, without touching ordinary membership history. Failed checks,
disconnects and revoked access preserve preferences. The disposable Redis test
container is removed after integration verification.
