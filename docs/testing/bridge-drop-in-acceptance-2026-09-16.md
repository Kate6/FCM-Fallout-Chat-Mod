# Drop-in bridge 0.2.0 — Dev candidate evidence

Local date: 2026-09-16; deployment/install: 2026-09-17 UTC. **Native acceptance is pending.**
No commit/push, extender fork, production operation or game input automation was performed.
Latest laptop candidate: [0.2.1 ZFE fallback follow-up](#021-laptop-zfe-fallback-follow-up).
The initial rollout below remains historical evidence for 0.2.0, not acceptance of 0.2.1.

## Architecture and automated checks

The visible HUD keeps its authentication, adapters, roster protocol and rendering. Only the
background bridge replaces native chat/auth with scoped storage. The overlay's authenticated
session feeds the existing shared roster-room system. User approval of AGENTS/CLAUDE edits
was conditional on preserving that boundary.

| Surface | Result |
| --- | --- |
| All visible-HUD `test-*.hxml`, native API/auth suites | Passed |
| Bridge state/export | 58 / 100 checks passed |
| Bridge package | 4 tests passed; Dev/Prod built and validated locally |
| Anchors, BA2, HUD package, SWF and release-script checks | Passed |
| Widget compile, FWS v32 validation, embedded emoji | Passed |
| Complete Ruffle suite | 45 passed; exact packaged child, isolated domain |
| Affected backend Jest / TypeScript check | 207 tests / 6 suites passed; typecheck passed |
| Complete backend Jest, isolated test environment | 123 suites / 1,544 tests passed; 9 skipped |
| Backend TypeScript unit runner | 455 passed / 62 suites |
| Dashboard suite / build | 405 tests / 35 files passed; build passed |
| Overlay suite, Linux and native Windows | 1,216 tests / 47 files passed on each OS |
| Isolated Linux/native Windows Dev packaging | Passed; metadata and required modules verified |

CI includes these tests in existing required backend, overlay/dashboard and HUD harness jobs;
new modules are also promotion-critical tracked-source requirements. Remote CI was not triggered
because no commit/push was authorized.

All four HUD ZFE/xScal ↔ bridge ZFE/xScal pairings pass native ROSTER-dispatch/shared-coordinator
integration tests: equal canonical IDs, bidirectional delivery without duplicates and common
retained history. HUD↔HUD and bridge↔bridge remain covered. Tests include isolation, missing/
one-sided/delayed sightings, fast travel, hopping, expiry, ownership/auth changes, stale work,
moderation/send fences and storage failures. Infrastructure is mocked, not native game clients.

Review fixes include connection ordering, synchronous exit/leave fences, queue-time freshness,
legacy-mode transition fences, Redis subscriber rejection handling, exact Documents fallback
spelling, the legacy send alias, selected-source observation age, and unload during native
getter/Subscribe callbacks. Ruffle enforces actual one-second write spacing without tolerance.

The first broad Jest run inherited local dotenv settings: 120 suites/1,539 tests passed,
five assertions failed in three unrelated environment/persona suites, nine tests were skipped.
A first clean-directory follow-up reached the password-protected local Redis and failed;
neither run is presented as green. The final complete run used a clean working directory,
CI test session/admin values, and a temporary loopback-only Redis on an allocated port:
**123 suites passed, 1,544 tests passed, nine skipped, 48.186 seconds**. No tests or production
environment code were changed to obtain this result. The Redis container was removed by the
runner's EXIT trap and absence was verified. JSON evidence is archived with the build's
`operations/backend-clean-jest.json`.

## Hosted Dev deployment and rollback

Only eight bridge-related backend files were overlaid onto the existing Dev checkout
`6a3c7161c7d9f60864e0b65163ebb57709da3a47`; their pre-change tracked versions matched the local
base. Unrelated newer commits and hosted dashboard changes were not deployed. Checkout remains
intentionally dirty; no fetch/reset/commit/push occurred.

- Compose: `iWO0FprKUe9j0CXg7k5yq` / `fcm-dev-stack`; `autoDeploy=false` preserved.
- Only `compose-reboot-back-end-hard-drive-q7s37s-backend-dev-1` was rebuilt/recreated.
- Image: `sha256:1be209e133ac7a8c15ef50dd424a32b37d33659935fe215bd771828868842744`.
- Source archive SHA-256: `d819c57cce86894f0c5f6b8f6bb99891d9cca258017afb5d50686e14cf64e276`.
- Backup: `/var/backups/fcm-dev-bridge020-l7K4aA/` contains old/new source, hashes and build log/script.
- Rollback image: `compose-reboot-back-end-hard-drive-q7s37s-backend-dev:before-bridge020-l7K4aA`.
- Customized compose checksum unchanged: `f162596d6d5b13951157c2830d3f998cc7b577df054919916d64dd1585a8881c`.
- `/api/health`: DB/Redis/Discord connected; container healthy. Running module reports `dev`.

No volumes, DB data, routes, production services or extender files were changed.

## Installed candidates

ZIP: `~/.local/share/fcm-dev-builds/bridge020-qLe1qs/FCMServerBridge-0.2.0-dev.zip`.
Both installed BA2 files equal the package/Ruffle manifest:

- BA2: `dd3c90e5fce798619cca516980fd8cc8a7bc235d740e5398f12745379832b9f2`.
- Decoded SWF: `e7d5fae7632e6035084a1b290991a80b48ebab2cd7d6fcfefe1a26c671dff410`.

Desktop app: `/home/devotek/.local/opt/fcm-dev/1.4.0-bridge020-qLe1qs/`; profile
`/home/devotek/.fcm/hosted-dev`. xScal remains unchanged. Game backup:
`/mnt/ExtraStorage/SteamLibrary/steamapps/common/Fallout76/.extender-backups/bridge020-before-qLe1qs/`.

Laptop app: `C:\Users\White\Apps\FCM-Hosted-Dev-1.4.0-bridge020-qLe1qs`; profile
`C:\Users\White\.fcm\hosted-dev`. ZFE remains unchanged. Game backup:
`C:\Program Files (x86)\Steam\steamapps\common\Fallout76\.extender-backups\bridge020-before-qLe1qs`.

Games were closed. Existing bridge-only loader/archive registration was preserved. Dedicated
old `FCMServerBridge.ini` chat fragments moved to backups; generic configs/native credentials
were not erased. Old versioned Dev apps remain recoverable. Prod apps/profiles/launchers were
untouched. Both apps start with `relayHost=dev.falloutchatmod.com`; Windows runs in session 1.

Windows used checksum-verified portable Node 24.18.0 without changing system Node. Temporary
build task, Node runtime and installed build dependencies were removed; logs/source archive
remain. Ruffle removed its players/server; port 41739 is no longer listening. Requested Dev
overlays intentionally remain running. Temporary hosted build files were removed after backup.
Local staging scripts/source archives and the final Jest report moved out of `/tmp` into
`~/.local/share/fcm-dev-builds/bridge020-qLe1qs/operations/`; no temporary test service remains.

## Manual acceptance — pending

1. Sign into the Dev overlay only. No bridge linking code exists.
2. Launch desktop/xScal and laptop/ZFE. Verify advancing exports and native storage/heartbeat
   timing without logging names/tokens. The bridge menu should report exporting.
3. Confirm Server only after backend confirmation; send/history exactly once; Party recovery.
4. Repeated same-world fast travel preserves room/history; hopping clears old bindings/rows.
5. Use **two distinct accounts**, one with the existing visible HUD, for all four mixed pairings.
   Compare room IDs and bidirectional delivery/history. Repeat HUD↔HUD and bridge↔bridge.
6. Exit/logout/restart in both startup orders; verify stale Server access expires.

Missing mutual sightings remain a discovery limitation, not grounds for unsafe merging. There
is no authoritative world ID; pre-discovery solo-room history is not migrated on convergence.
Ruffle cannot certify GFx compatibility, native disk latency, game stability or actual world
identity. Game Pass remains unverified.

## 0.2.1 laptop ZFE fallback follow-up

**Installed on the laptop only; native-unverified.** Desktop/xScal remains on the working
0.2.0 candidate. Visible HUD source/architecture, overlays, backend, extender files and game
configuration were not changed in this follow-up.

[Confirmed] The laptop's 2026-09-16 22:03–22:09 local-time session detected the game but
created no `dev-state.json` in any of the three supported ZFE export locations. Its `zfe.log`
records 13 general-API attachment failures starting at 22:05:46, while also recording
`ROOT_A.BRG_OBJ.call` installation at 22:05:46.615. The installed 0.2.0 BA2 matched the tested
hash. The desktop export was active with 22 names (names not recorded here).

[Confirmed] The new storage adapter omitted the existing native HUD's `BRG_OBJ` lookup.
A pure regression failed on that missing route before the change. 0.2.1 adds the fallback
after modern aliases, includes explicit movie-root and optional global discovery, and still
requires successful `getRuntimeInfo` with `zfe-storage-v1`. It never invokes native chat/auth.
The loader menu reports `Storage route` from the validated adapter.

[Hypothesized] The missing lookup explains the laptop failure. Confirm with a fresh 0.2.1
native export and overlay Server confirmation. If the fallback does not expose storage or the
bridge still produces no export, this hypothesis is insufficient; do not weaken capability
checks, invent a snapshot, change HUD authentication or label the native problem fixed.

Fresh automated results:

- Bridge export/storage: 124 checks; state: 58 checks; Dev/Prod package: four tests passed.
- All visible-HUD pure Haxe suites, native API/auth suites and compiler check passed.
- Source anchors, BA2, widget package, SWF and release-script checks passed. The initial
  unittest-discovery invocation was incorrect for the standalone anchor script; the documented
  direct invocations subsequently passed without source changes.
- Full Ruffle suite: **47 passed (3.3m)**, including isolated BRG_OBJ-only export/travel/unload
  and missing-capability/no-write/recovery cases. Native-only storage support is not simulated proof.
- Backend bridge suites: **83 tests / six suites passed** in an isolated test environment.
- Overlay: **1,216 tests / 47 files passed**; affected dashboard bridge/Party suites: **18 tests passed**.
- Required CI jobs already include the changed Haxe and packaged-bridge test files. No remote CI
  or publishing was triggered.

Artifact: `~/.local/share/fcm-dev-builds/bridge021-1wKzWb/FCMServerBridge-0.2.1-dev.zip`.
The final manifest equals the Ruffle-tested package manifest:

- BA2 SHA-256: `15036f080b1ae1d8d3edf660d7baf74a5e0f7a581cc15a07487ed1a78be64e0c`.
- Decoded SWF SHA-256: `58d88c38febb235d2315fd30ea98d0b251717e60e42a5781b288c37cdc6ead2e`.
- ZIP SHA-256: `f104987e6ec9780f386c28daca99bf9d953aa77a29a02611cb0336d80da6287b`.

Game closure was checked before installation. Only `Data/FCMServerBridge.ba2` and
`FCMServerBridge.build.json` were replaced; installed BA2 hash verified and loader registry
checksum unchanged. Recoverable originals:
`C:\Program Files (x86)\Steam\steamapps\common\Fallout76\.extender-backups\bridge021-before-1wKzWb`.
The scoped installer and source ZIP remain in `C:\Users\White\fcm-build\bridge021-1wKzWb`.
Temporary packaging directories, Ruffle players/server and isolated Redis were torn down;
port 41739 was verified closed. Local staging was moved out of `/tmp` into the artifact folder.

Next manual check: launch the laptop game, enter a world and leave the Dev overlay authenticated.
If Server does not appear, inspect F11 → FCM Server Bridge for build 0.2.1, storage route and
export status. Do not press refresh/reconnect or edit the exported file to force success.

## 0.2.2 laptop diagnostic follow-up

[Confirmed] The user reported 0.2.1 still showed `provider pending`, `party list invalid`
and `Storage route - not confirmed`. The 22:35 local-time ZFE session created no supported
export. Attachment warnings also occurred in historical working sessions, so those warnings
alone do not establish the cause. The missing-route-only hypothesis remains insufficient.

0.2.2 is diagnostic-only: fixed-label storage probe stages distinguish call/parse/rejection/
capability failure, and the menu retains the last caught lifecycle phase plus numeric error
code. No raw replies, exception messages, credentials or roster names enter diagnostics.
The existing provider polling cadence, storage capability gates and visible HUD architecture
remain unchanged. Native method-entry faults are still not reproducible/certifiable in Ruffle.

Fresh local gates passed: bridge export 132 checks, state 58, four package tests, all visible
HUD pure Haxe suites and compiler checks, native API/auth, source anchors, BA2/SWF/package and
release-script checks. Complete Ruffle: **49 passed (3.6m)**, including malformed runtime reply
and throwing native-call diagnostics, no-private-payload checks, recovery and teardown.
Backend: 83 tests/six suites; overlay: 1,216 tests/47 files; dashboard bridge/Party: 18 tests.
Existing CI jobs cover these files; hosted CI was not triggered. Dedicated Haxe diagnostics,
FFDec and archive tools were unavailable; compiler and local structural/package checks were used.

Artifact: `~/.local/share/fcm-dev-builds/bridge022-Nxyitn/FCMServerBridge-0.2.2-dev.zip`.
Final package manifest is semantically equal to the Ruffle-tested manifest (JSON 30 vs 30.0
serialization only); authoritative payload hashes match:

- BA2: `b55388933b50f01d214bcbe46c41adb8eb62d4ea4ff20652d74283f2e1b0f063`.
- SWF: `7cfbc2d66530c26f84b90d25466d7f0fed4689279269aeae8e16291c1579a19f`.
- ZIP: `92f4a4d62fcd28163013af709b9bdcb5a8bfaeb71091ce327c553eb682a857e2`.

[Confirmed] Laptop installation verified game closure, preserved 0.2.1 in
`C:\Program Files (x86)\Steam\steamapps\common\Fallout76\.extender-backups\bridge022-before-Nxyitn`,
and replaced only the bridge BA2/build manifest. Installed checksum matches; loader registry
checksum is unchanged. No extender, overlay, desktop, Prod, commit or push operation occurred.
Owned Ruffle server/players and isolated Redis were torn down; port 41739 has no listener.

Native-unverified: launch into a world and capture F11 → FCM Server Bridge, especially
`Storage probe` and `Last failure`. The latter is historical until movie reload, not current
health. No native fix or shared-room acceptance is claimed by this diagnostic installation.

## 0.2.3 bounded ZFE response parser

[Confirmed] The user's 0.2.2 screenshot reports `__SFCodeObj parse E1014`, fresh roster,
accepted Map/Public Teams, eight subscriptions and no outer lifecycle failure. This proves
the instrumented native call returned and the error occurred in the parse phase; it does
not identify a missing class or establish storage support. The code used `haxe.Json.parse`
for both runtime-info and write acknowledgements.

[Hypothesized] The generic parser dependency triggers the native failure. 0.2.3 replaces
both decoding calls with the existing, unchanged visible HUD `FcmJson` reader. Confirm with
a fresh native successful probe/export and overlay confirmation; another E1014 or failed
capability response refutes completion. Serialization, roster policy, authentication,
provider precedence and the visible HUD architecture remain unchanged.

The new red tests rejected the old source/parser choice and exposed its lack of a response
size bound. After the change, pure tests cover whitespace/extra fields, deep/oversized
responses, malformed acknowledgement JSON, false success and non-saved status. The package
validator now fails if `JsonParser` is linked; packaged tests require `FcmJson`. Ruffle uses
formatted/escaped capability responses and adds oversized-reply rejection/recovery. These
are regression controls, not an emulation of native E1014.

Verification completed: 141 bridge export/storage checks, 58 state checks, five bridge
package tests (Dev/Prod), all visible-HUD pure suites/compiler checks, native API/auth,
source anchors, BA2/SWF/widget package and release-script gates. Complete Ruffle:
**50 passed (3.7m)**. Backend: 83/six suites; overlay: 1,216/47 files; dashboard bridge/Party:
18/two files. Required CI jobs already run these suites; hosted CI was not triggered.
Dedicated Haxe diagnostics/FFDec/archive tools were unavailable; compiler/local structural
validation supplied the artifact checks. Owned Ruffle server and Redis were torn down;
port 41739 is closed.

[Confirmed] Installed on laptop `msi`, after two game-closure checks, replacing only bridge
BA2 and build manifest. Loader registry hash unchanged; desktop and extenders untouched.
Previous 0.2.2 preserved at
`C:\Program Files (x86)\Steam\steamapps\common\Fallout76\.extender-backups\bridge023-before-XQ3SIv`.
ZIP/installer retained at `C:\Users\White\fcm-build\bridge023-XQ3SIv` and
`~/.local/share/fcm-dev-builds/bridge023-XQ3SIv` locally. Final manifest semantically equals
the Ruffle-tested manifest; installed payload hash matches:

- BA2: `f06f218ad64b63f94527fa1252cc646451599bf252a5b9083b3e7c35abb4098d`.
- SWF: `8a3956a2e3c8457aac6e1c80d2d0b77fa906e3b3993ed2d332cf9f057311d927`.
- ZIP: `0d5f63141eecc23c58d8d2a0e8ec8da9148e1dca188afc4295fbef68673d823a`.

Native-unverified. Next: enter a world, inspect 0.2.3's storage probe/route and export status,
then require a fresh advancing export and backend-confirmed Server tab in the authenticated
Dev overlay. Preserve capability gates if the next status reveals another failure. No
production changes, commit/push, game automation or visible-HUD architecture changes.

### Native follow-up — 2026-09-17

[Confirmed] Read-only checks on laptop `msi` at 04:26–04:27 UTC found build 0.2.3,
provider `zfe`, environment `dev`, state `active`. Export sequence advanced from 95 to
112 and observation sequence from 86 to 103. Observation age was 1,115–1,990 ms;
roster count changed from 22 to 21. No roster names, credentials or room identifiers
were recorded. This establishes successful native scoped-storage export and continuing
fresh observations after replacing the response parser.

The checked ZFE log segment contained no parse-E1014, storage-failure or fatal entries.
This is a bounded log check, not proof that every native failure would be logged. The
overlay log did not provide an explicit room-confirmation record. The user subsequently
reported "it looks like its working"; record this as user-reported operation, not an
independently verified canonical-room or message-delivery assertion.

Laptop ZFE export recovery is accepted. Still pending: two distinct clients in the same
world verifying equal canonical rooms, bidirectional exactly-once messages and retained
history; same-world fast travel without room/history churn; world hop/expiry/account-change
acceptance across the mixed HUD/bridge provider matrix. Do not generalize this check into
complete native acceptance of all pairings.
