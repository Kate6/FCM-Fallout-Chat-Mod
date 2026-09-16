# xScal visible HUD acceptance — 2026-09-15

## Scope and installation

User-authorized local switch from ZFE to the official Nexus xScal 0.2.16 download, paired with
FCMChatWidget 2.10.101 against hosted Dev. Fallout 76 was confirmed closed before writing.
Initially only the visible widget was registered. The later game-closed switch to the invisible
bridge is recorded below; they are never coinstalled. No production/backend changes, publication,
commit, or game-input automation.

- Game: Steam/Proton at `/mnt/ExtraStorage/SteamLibrary/steamapps/common/Fallout76`.
- xScal: official downloaded `dxgi.dll`, 315904 bytes, matching the 0.2.16 harness fixture for
  Fallout runtime 1.7.26.10. A fresh native runtime/probe check remains required.
- Endpoint: existing `[Chat] enabled=true`,
  `relayEndpoint=wss://dev.falloutchatmod.com/relay`; widget link host remains hosted Dev.
- `xscal.ini`, `Data/FCMChat.ini`, `Data/hudmodloader.ini`, and the active Proton
  `Fallout76Custom.ini` were preserved byte-for-byte. Native authentication was not modified.
  Existing xScal priority/affinity settings were preserved, not reset to package defaults.
- Active loader entry: `FCMChatWidget`; archive list: `HUDModLoader.ba2,FCMChatWidget.ba2`.
- Both stale root/Data widget version stamps were corrected to 2.10.101. The decoded BA2 SWF,
  not the version-stamp file, is authoritative. Packaged keybind/customization/menu guides were
  copied into the game directory.
- Recoverable prior files are in the game directory's
  `.extender-backups/before-xscal-0.2.16-hud-2.10.101-MTikSi/`. Restore only with the game closed.

| Artifact | Initial 2.10.101 install SHA-256 |
| --- | --- |
| xScal `dxgi.dll` | `185de187aa616ae5db118f463aa43ff760f7819df77ca4a09f6b71714195fd5a` |
| `Data/FCMChatWidget.ba2` | `0d6b80715590e1f762a9d1d4267dec1fbdf0e58e3b9d7a587aa5fe3cdc83c255` |
| Extracted `interface/FCMChatWidget.swf` | `1aa6f751f227b79247edf5366edb0461aa446fae962ab8e44cc6718e0053a5a0` |

## Automated evidence

Passed before installation: all 20 widget Haxe suites; native adapter/auth suites; empty Haxe
compiler diagnostics; source anchors; package, BA2, SWF, embedded emoji and generated catalog
checks; all three JavaScript emoji suites; and the full 28-test Ruffle suite (36.9 seconds).
The installed archive's extracted SWF matches the tested normalized FWS v32 production SWF
byte-for-byte. Harness teardown released port 41739. Hosted CI was not run for these local changes.

The full suite includes xScal object-method routing, key registration/rebinding/old-key release,
editor-gated link activation, container guards, history/echo contracts, and real AVM2 widget
assertions for Server-tab visibility, history/nonce preservation, same-server recovery and real
roster changes. Some input/appearance tests assert source or browser delivery rather than GFx
state; passing them does not certify native control suppression, browser launching, visual layout,
or network delivery. Bridge regressions are included in the shared suite, but no native bridge
installation or acceptance was performed.

## Native acceptance — in progress

Fresh native evidence now confirms Fallout runtime 1.7.26.10, widget 2.10.101, selection of the
xScal adapter, and authenticated state. Initial history arrived in 16/16/9-event batches: 40
records plus the completion marker. A later replay rejected all 40 duplicate records. Three
General sends returned successful native send results and authoritative echoes; each used the
bounded fallback match (`ownEchoFallback=1`, `ownEchoAmbiguous=0`) with no appended duplicate.
All seven configured default physical keys registered successfully. This is not proof of every
physical action or of reception by Discord/another client.

The log also records a Loading transition at elapsed 00:02:08, return to ordinary HUD mode at
00:02:23, then a roster-boundary reset at 00:03:14 and a different room confirmation at 00:03:24.
The first room was confirmed three times before that change. The user confirmed this was
same-world fast travel: continuity failed in the installed 2.10.101 build.
No explicit native error-level line, rejected send or isolated callback exception was found in
the reviewed window. A bounded read-only capture completed at 01:35:27 UTC on September 16;
the manifest records `inputAutomation=false`, and the game was left running under user control.

### 2.10.102 correction — native ordinary fast-travel retest passed

The shared selector previously returned an empty MapMenuData snapshot before considering the
populated PublicTeamsData observation. New pure tests and HUD/bridge Ruffle scenarios reproduced
the reset under both xScal and ZFE before the fix. Selection now permits overlapping populated
player/public-team fallback without admitting disjoint cached lower-priority names. A populated
map still takes priority; nearby-only lists do not override an empty primary. No freshness/grace
or backend lease limits changed. All 28 Ruffle tests passed after the correction (40.4 seconds).
After the user closed Fallout 76, the
2.10.102 HUD was installed from the tested xScal/Dev package. Only `Data/FCMChatWidget.ba2` and
the root/Data version stamps changed. The unchanged xScal hash is recorded above; `xscal.ini`,
`Data/FCMChat.ini`, loader registration and active Proton archive configuration were verified
byte-for-byte against backups. Native authentication and the invisible bridge were not touched.

The prior HUD/version stamps and configuration snapshots are recoverable under the game directory's
`.extender-backups/before-hud-2.10.102-rezILC/`. Restore only while the game is closed.
The installed archive was extracted again and its SWF matched the tested normalized FWS v32
artifact exactly. Hashes of the tested visible HUD (now retained inactive):

- BA2: `43cff32998f0be42b9ca7909e9824cd3e5d5a8462ebe64282c84ecea51a3f452`.
- Decoded SWF: `4dddd9c580838c3f5aea2d5210c4312a24280b59189548d0d1d7275ea0594407`.

The subsequent native 2.10.102 run confirmed runtime 1.7.26.10, xScal selection, authenticated
state, 40 history records plus the completion marker and no dropped events. One General send
(elapsed 2:19) and one Server send (3:24) were accepted and reconciled with authoritative echoes;
both used the bounded legacy fallback match and appended no duplicate. Loading transitions at
2:46–2:53 and 3:34–3:45 preserved the same confirmed room through the reviewed 4:26 window.
There was no room/history reset or explicit error/failure in that window. This does not prove
reception by Discord/another client or visual appearance. MapMenuData remained populated
(21–24 names), so **the exact empty-map/public-team fallback is still native-test pending**.
Do not describe ordinary fast-travel success as coverage of a condition absent from the capture.

Perform these in order, with manual game input and sanitized fresh `xscal.log` evidence. Do not
carry forward older ZFE or xScal 0.1.15 results as acceptance of this installed combination.

| Check | Required evidence | Result |
| --- | --- | --- |
| Startup/auth/history | Fresh 2.10.102 marker, xScal adapter/runtime, authenticated Dev connection, complete multi-channel replay, readable text | Native startup/auth and 40-record replay passed; per-channel visual/font acceptance pending |
| Server membership | Visible Server tab plus current room acknowledgement | Native acknowledgements confirmed; user-visible tab confirmation pending |
| General/static sends | One accepted message/self-echo per channel; verify reception on Dev overlay/Discord separately | Three General sends/echoes passed; other channels and external reception pending |
| Server send | One accepted Server message/self-echo; verify another room participant separately | Native 2.10.102 send/echo passed; other-client reception pending |
| Editor/default keys | Insert opens once, typing/editing, Enter submits once, Escape cancels, gameplay input restored, Page Up/Down channel navigation, Up/Down selection only while editing, Delete hide outside editing | Pending |
| Full rebind | Game-closed edit of every binding in `Data/FCMChat.ini`, restart, accepted new VKs, each new action works and each superseded key is inactive; restore original profile afterward | Pending |
| Container conflict | With a temporary T binding, container mode does not open chat or steal Deposit All; held T does not open chat on leaving the container | Pending |
| Links/mentions | Regular URL, Discord channel and event target; selection color, shortened display, full safe URL; activation only after OpenChat; default browser actually opens | Pending; native URL-opening capability must be verified |
| Customization | Independent focused/unfocused tab colors, selected-row color, fonts/emoji, wrapping/width, settings survive restart; restore test settings | Pending |
| Same-world fast travel | Selected Server tab, existing history and room remain; no unnecessary LEAVE | 2.10.102 native room continuity passed through two loading transitions; exact empty-map fallback and visual tab/history acceptance pending |
| Real hop/MainMenu | Old Server history clears, old room leaves, new room confirms; no stale delivery | Pending |
| Recovery/performance | Reload/reconnect and repeated open/cancel/send remain responsive, no blank/crash, timers and owned input clean up | Pending |

Start with startup/history, Server membership and one General/Server send before proceeding to
more disruptive tests. Do not mass-send, reset authentication, hop worlds, or alter bindings
automatically. The read-only Linux collector in `hudmodloader-chat/native-capture/` can record a
bounded user-controlled session; it never owns or stops the game. Review sanitizer output before
sharing, and report only allowlisted counts, status, error codes, versions and timings.

## Background bridge phase — installed, awaiting manual game test

After the user closed the game, the latest local `dev` checkout (HEAD `6a3c7161`, matching
`origin/dev` at build time) was used with its existing uncommitted HUD/bridge corrections.
No commit, push, deployment or publication was performed.

- Added three repeated source-switch/travel cycles to each real HUD/bridge Ruffle scenario,
  required per-cycle pass markers and retained real-hop/expiry/MainMenu/teardown assertions.
  All 28 tests passed in 36.2 seconds under both providers; port 41739 was rebound afterward.
- Re-ran all 20 widget Haxe suites, shared native/auth tests, source/package/BA2/SWF/emoji checks,
  bridge's 34 pure checks and both package-target tests. Haxe diagnostics were empty. Also passed
  1,148 overlay unit tests, 41 backend bridge tests and six dashboard bridge-feed tests.
- Built overlay **1.4.0**, `fcmChannel=qa`, with `npm run dist:dev -- --linux --dir`.
  Installed the complete unpacked app at `/home/devotek/.local/opt/fcm-dev/1.4.0-bridge-Pto2KZ/`.
  Its `resources/app.asar` SHA-256 is
  `c9d57689d3a4ec8be8328b9826e185a2ed0c55b679eb46336efe81246a65ec25`.
  The separate **Fallout Chat Mod (Hosted Dev)** application launcher supplies
  `--user-data-dir=/home/devotek/.fcm/hosted-dev` and clears inherited relay/debug overrides.
  Startup logs confirm packaged 1.4.0, `dev.falloutchatmod.com`, that isolated profile, and no
  reported module/uncaught/renderer-exit error. Authenticated desktop chat/bridge delivery is
  **not yet verified**. It was subsequently stopped for the reported freeze isolation below;
  Prod was not replaced or stopped.
- Rebuilt **FCMServerBridge 0.1.1 DEV** after all shared roster corrections. Installed BA2:
  `f8f76272c0a18e4b6631fbce29ec61fb5981579d58d6c1b5c1b37ba2569c8515`.
  The extracted 39,856-byte FWS v32 SWF matches the package manifest hash:
  `ae6ba54c1c6d0d1d6f032dfac68a032b8665b86b3ca4aa1a06f642b07a40fba4`.
  `FCMServerBridge.build.json` and `FCMServerBridge-INSTALL.txt` accompany the local install.
- The loader now lists only `FCMServerBridge`; the active Proton archive list is
  `HUDModLoader.ba2,FCMServerBridge.ba2`. Exact comparison confirmed no unrelated INI changes.
  xScal 0.2.16 and its Dev endpoint/other settings are unchanged; native credentials were not read
  or modified. The visible HUD archive remains intact but inactive. Registry/archive snapshots,
  xScal settings and the prior visible archive are recoverable in the game directory under
  `.extender-backups/before-bridge-0.1.1-VNj1Bt/`. Restore only with the game closed.

### Steam pre-launch wait — resolved by user, bridge acceptance still pending

The user reported Fallout would not launch. Read-only inspection found no Fallout/Wine process,
no fresh xScal output (last modification 21:54:23 local), and no new crash dump. Steam's
`logs/console_log.txt:1868` shows launch action 12 waiting at `ShowInterstitials` at 22:07:51;
it advanced at 22:09:34, then line 1876 recorded **waiting for user response to CreatingProcess**.
`gameprocess_log.txt` had no new Fallout process after the preceding 21:54 shutdown. This is
confirmed pre-launch waiting, **not evidence of a bridge/native crash**. The exact pending Steam
prompt has not been visually identified. The user was asked to bring Steam forward and inspect
its launch dialog. Steam subsequently logged continuation at **22:11:26**, started Fallout,
and a fresh native xScal log identified runtime 1.7.26.10. `Fallout76.exe` was confirmed running;
the Dev overlay emitted visible=true after detecting it. No game, Steam or Prod process was
stopped and no input was automated. This confirms launch recovery, not bridge authentication
or room/desktop delivery.

Complete the Dev overlay's normal Discord authorization with the same
linked account as the bridge. Open F11 → **FCM Server Bridge** only to inspect status/linking;
there is intentionally no in-game chat widget or editor in this configuration. Verify:

1. Fresh native 0.1.1/xScal startup, authenticated state and room confirmation.
2. Desktop `bridge:state=ready` and Server tab after the account/device lease is confirmed.
   No Server tab while the game is closed is expected; an HTTP health check alone proves neither
   the deployed bridge handler nor account pairing.
3. One General message reaches the Dev static feed/Discord; one Server message reaches the
   same-room desktop/native peer exactly once. Server chat is private and does **not** go to Discord.
4. Repeated same-world travel retains the room/history; separately observe an empty-map fallback
   if the native UI produces it. Real hop/MainMenu retires the old room. Respect 30-second native
   observation and 45-second backend lease expiry; do not lengthen either to hide a failure.

Two-client same/different-world acceptance, both native providers and all remaining lifecycle,
permission, duplicate and recovery cases remain required before distribution. Ruffle coverage
cannot certify native DLL scheduling, GFx behavior or authoritative game-world identity.

### First native bridge run — failed acceptance, investigation open

The user entered a world and reported **Waiting for a fresh world roster** in F11, pressed
Reconnect, then reported the game freezing. The displayed status implies the bridge reached
authenticated state but lacked acceptable fresh in-world evidence (`FCMServerBridge.world`).
It does not establish that native reconnect caused the freeze; no current stack/crash dump or
phase-timed bridge log identifies the stalled operation. This bridge build does not emit the
visible widget's lifecycle/roster diagnostics, so absence of FCM lines in `xscal.log` is not
evidence that the bridge did not load.

The 709-byte native xScal startup log was preserved in the local evidence directory
`/tmp/fcm-bridge-overlay-dev-SyDvGr/xscal-freeze.log`; its last write was 22:12:04 local.
The existing `steam-1151340.log` was an empty June file, not evidence for this run. No game
memory was inspected. Only the exact new Dev overlay process was sent SIGTERM for isolation;
Fallout, Steam and Prod were left untouched. The user subsequently confirmed the game remained
frozen after the new Dev overlay stopped. This does not by itself identify the originating
stall. No game files were swapped while Fallout remained running; the user was asked to close
the game manually before the bridge can be disabled or replaced.

The user also reported the overlay header could not be dragged. The affected Dev-versus-Prod
window and whether the symptom persists after the new Dev process stops are not yet identified.
Do not modify Prod settings, restart the game, weaken provider-readiness gates, lengthen leases,
or claim a root cause from this report alone. Next evidence is the exact affected window,
game responsiveness after Dev shutdown, and game-closed permission before disabling/replacing
the bridge. Compare real subscription push data versus cached provider reads before changing
the roster protocol: existing mock pushes update the read cache together and cannot prove those
native paths stay synchronized.

### Bridge 0.1.2 and Linux header correction — installed, native acceptance pending

The user closed Fallout and authorized the bridge fix/install and overlay drag correction.
Process-name checks confirmed no Fallout process before game-file replacement. No game input
was automated, no native module was inspected/loaded, and Prod was not stopped or modified.

[Confirmed] The old bridge callback ignored the delivered event and reread `GetDataFromClient`.
The old mock updated the getter before invoking `callback(null)`, so it could not expose divergent
push/read snapshots. The new actual-bridge Ruffle test failed on **both** providers at “fresh event
wins over stale getter” before the fix, then passed. Upstream HUDModLoader source at
`71e2fde134933323777980b5e0fd0c6036c2408f` provides implementation evidence for
`FromClientDataEvent.fromClient` and accessor-backed `UIDataFromClient.data/dataReady/isTest`;
this is not a claim that the installed game artifact has been decompiled this turn.

0.1.2 consumes those validated envelopes, retains the event observation time while a getter lags,
and does not fall back to that older getter after push expiry. It keeps readiness/world gates and
the 30-second observation/45-second backend lease limits. Menu retries coalesce into a guarded
timer refresh; a healthy transport is not disconnected or reset by the menu callback. Identity
changes reconnect after the observation batch. ZFE controls require its async-control capability.
The bridge now emits capped fixed-field phase/status diagnostics, excluding names, room IDs,
credentials, codes and bodies. **The original native stall remains unproven**; actual transport
error/unload disconnect latency and fresh game acceptance remain manual checks.

[Confirmed] The Linux overlay handler ignored explicit `no-drag` on div/span controls and
rejected all modal drags, even though onboarding's stylesheet designates a drag header.
Two new unit cases failed before the fix and passed afterward. Real Electron tests verify native
window movement for the pre-auth strip, a shared-header-shaped fixture, actual Settings title
and actual onboarding title; the fixture's control remains stationary. These tests passed on
the local KDE/XWayland desktop and under Xvfb. The small default Xvfb screen initially clamped the
window against its work-area edge, correctly preventing further rightward movement; CI explicitly
uses a 1920x1080 test screen. This does not certify game-focused click delivery or mixed-DPI
movement distances; focus the overlay before dragging because game-focus click-through is retained.

Final local checks: 28 full Ruffle tests (36.3 seconds), all 20 widget Haxe suites, native API/auth
suites, 34 bridge-state checks, both endpoint package tests, source anchors/BA2/SWF validation,
empty Haxe diagnostics, 41 overlay Vitest files / 1,150 tests, clean overlay TypeScript check,
4 backend bridge suites / 41 tests, and 6 shared-renderer bridge-feed tests. The new desktop smoke
is wired into the existing required Linux CI gate; no hosted CI run is claimed. Test Electron
profiles/processes and local relay servers were torn down; binding port 41739 afterward proved
the Ruffle server released it. The installed Dev overlay below is deliberately left running.

Installed artifacts and rollback:

- `Data/FCMServerBridge.ba2`, **0.1.2 DEV**, SHA-256
  `46c134b3f6895dce9ca3862f645fc67cbd7eef3ca675a10845c9cd86e067bbf2`.
  The package validates one `Interface/FCMServerBridge.swf`, 41,380 bytes, FWS v32, SHA-256
  `bc2a769a52bf591e8db32d526303d320b14fa134893c45a638b05b8076e43c06`.
- Previous bridge, manifest/instructions and config snapshots are recoverable under
  `.extender-backups/before-bridge-0.1.2-aDaXG5/` in the game directory. Config comparisons confirm
  `hudmodloader.ini`, active Proton `Fallout76Custom.ini` and `xscal.ini` were unchanged.
  xScal remains official 0.2.16 with its prior hash and Dev endpoint; native auth files were untouched.
- Isolated Dev overlay 1.4.0 (`fcmChannel=qa`) is installed at
  `/home/devotek/.local/opt/fcm-dev/1.4.0-bridge-fix-4pwO2Q/fallout-chat-mod`, app.asar SHA-256
  `b270b91f4c7eb589e92f623d4f48548f7bb89adcdf5f19506abc2890847dfaae`.
  The existing Hosted Dev launcher now selects that exact executable and
  `--user-data-dir=/home/devotek/.fcm/hosted-dev --ozone-platform=x11`.
  Startup at 22:43:43 local confirms packaged=true, `dev.falloutchatmod.com`, isolated profile and
  Linux drag initialization, without a reported missing-module/uncaught/renderer-exit startup error.

Next manual check: authorize the Dev overlay if requested, enter one world, inspect F11 →
FCM Server Bridge, and verify the desktop Server tab and delivery. If it freezes again, do not
repeatedly reconnect; preserve the new phase/status log. This is an authorized local candidate,
not a release, native acceptance, backend deployment, commit or push.

## 0.1.2 native roster failure and 0.1.3 diagnostic candidate

[Confirmed] The user entered a world with the installed 0.1.2 bridge and reported F11 status
“Waiting for a fresh world roster.” Opening and closing the map did not change it. This status
is assigned in `FCMServerBridge.world` only when authenticated and `state.fresh(now)` is false.
It does not distinguish rejected MenuStackData from rejected/stale roster observations.
The fresh xScal log remained 709 bytes with native initialization only (mtime 2026-09-15
23:18:13 EDT); the optional bridge logger supplied no observation details. The installed BA2
still matched `46c134b3f6895dce9ca3862f645fc67cbd7eef3ca675a10845c9cd86e067bbf2`.

[Confirmed] A read-only check of the hosted Dev backend found its compiled bridge handlers,
and its Redis contained zero `relay:bridge:device:*`, `relay:bridge:account:*`, `relay:roster:*`
and `relay:world:*` keys. The isolated Dev overlay log showed reconnect with five channels
retained when Fallout appeared, and the backend recorded a desktop WebSocket connection.
No account/device secrets or roster contents were printed and no hosted state was mutated.
This establishes missing room evidence at that check, not the exact native rejection cause.

0.1.3 is **diagnostic-only and not installed/native-accepted**. It adds a version/provider row,
cached menu reason, overall roster freshness and six fixed per-provider reasons to the existing
F11 menu. It preserves readiness, session/lease lifetime, provider selection, transport calls,
and reconnect behavior. Menu preparation performs no native/provider calls. Labels carry no
names, payloads, room IDs or request nonces. Both Ruffle provider scenarios now require the
diagnostic marker and check read-only menu preparation, bounded inert rows and privacy. These
tests do not reproduce or fix the native failure; capture the new menu rows on the next run.

Local verification: 44 pure bridge-state checks; all 20 widget Haxe suites; shared native
API/auth checks; source anchors, BA2/SWF and emoji validation; both endpoint package tests;
all 28 Ruffle tests (37.5 seconds); 1,150 overlay tests; four backend suites / 41 tests;
six dashboard bridge-feed tests. The first backend command used nonexistent test paths and
ran no tests; the corrected `backend/tests/*.test.js` selection passed. Compiler diagnostics
reported no project-file issues, with two warnings in the installed Haxe standard library
(`Std.hx`, `Boot.hx`). The dedicated diagnostics tool was unavailable; this was compiler
`--display diagnostics`. Package tests retain existing BA2 helper ResourceWarnings. Teardown
was verified by rebinding loopback port 41739; no game input was automated. Hosted CI not run.

Prepared `/tmp/fcm-bridge-readiness-YnTTma/FCM-Server-Bridge-0.1.3-DEV.zip` (28,060 bytes):
one `Interface/FCMServerBridge.swf`, 42,685 bytes, FWS v32, 400x300, 30 fps, one frame, seven tags.
SWF SHA-256 `74f6052e5344c622b48e052b74243eaaa4e2fc4a1a04e166c56acd5c8b7e5be8`;
BA2 SHA-256 `b3bbbd4c184ab00201978d6a195eaaf309e7552dab36357e140563237884fd49`.
The package validated decoded-byte equality and target endpoint/config stamps. Game files,
native credentials, installed overlays, hosted Dev and Prod were not changed by this follow-up.

### Authorized local installation of diagnostic 0.1.3

After explicit user approval, confirmed no Fallout process and installed the exact tested Dev
archive above. The installed BA2 SHA-256 is
`b3bbbd4c184ab00201978d6a195eaaf309e7552dab36357e140563237884fd49`, matching the ZIP manifest;
the extracted payload matched the tested SWF hash and passed structural validation before copy.
`FCMServerBridge.build.json` and `FCMServerBridge-INSTALL.txt` also match the package byte-for-byte.

The three replaced files plus unchanged config snapshots are backed up in the game directory at
`.extender-backups/before-bridge-0.1.3-NiarTd/`. Byte comparisons confirm `Data/hudmodloader.ini`,
active Proton `Fallout76Custom.ini` and `xscal.ini` were unchanged. The single active bridge remains
configured for `wss://dev.falloutchatmod.com/relay`; xScal, native account credentials, Dev/Prod
overlays and hosted services were untouched. No source change or new test build occurred during
installation; the preceding full local gate applies to the installed artifact.

Native acceptance remains pending. Next: manually launch Fallout, enter a world, open F11 →
FCM Server Bridge, confirm version 0.1.3 and capture the Menu/Roster/provider diagnostic rows.
Do not include a link code or repeatedly press Reconnect. Installation does not establish that
the missing Server room or prior freeze is fixed.

## 0.1.3 native exceptions and 0.1.4 diagnostic candidate

[Confirmed, 2026-09-16] The user's screenshot identifies `Bridge 0.1.3 - xscal`,
`Menu - world allowed`, `Roster - not observed`, and `read failed` for Map, Public teams,
Player list, Team markers, Party list and Voice area. The main status remains `Waiting for
a fresh world roster`. In 0.1.3, the catch surrounds all of `FCMServerBridge.observe`, including
`GetDataFromClient`, push-cache selection and `FcmBridgeState.observe`. The screenshot therefore
does **not** identify a getter exception, missing native capability or specific error ID.
The installed bridge BA2 still matches
`b3bbbd4c184ab00201978d6a195eaaf309e7552dab36357e140563237884fd49`.
The xScal log remains 709 bytes, native initialization only, last written 2026-09-15 23:43:58 EDT.

[Confirmed] Read-only extraction of the installed `Data/HUDModLoader.ba2` (SHA-256
`0a8ef32357b484d152baab79b1c1aea90f9afcf577ad550fbdc5a8155f035f69`) yielded its
59,286-byte `interface/HUDTools.swf` (SHA-256
`c0fdaa0f54f0d36c4e84516e2941cc1ead31fa2867a32d5ff18a030eb1dbb5a3`).
FFDec 26.3.0, downloaded from the official jindrapetrik/jpexs-decompiler release, decompiled
`BSUIDataManager`, `UIDataFromClient` and `UIDataShuttleConnector`. The installed getter/subscription
signatures and provider accessors match the pinned source contract used here. This proves the
interface, not readiness or runtime contents. The installed 0.1.3 bridge was also decompiled;
`haxe.iterators.ArrayIterator` has an implementation in that SWF, so a string-table reference alone
does not establish a missing-class cause. No native module or game memory was inspected.

0.1.4 is a **diagnostic-only candidate, not installed or native-accepted**. `FcmBridgeRead` keeps
an observation-local phase, including getter versus processor entry and bounded processing stages.
Escaping errors retain only an integer `errorID` in 1..99999 or the fixed word `error`; exception
messages, stack traces, names and payloads are never rendered. A separate cached menu row reports
successful subscriptions out of eight and the latest subscription error ID. Per-attempt state
prevents nested callbacks from overwriting each other's phase. Optional-field helper catches are
unchanged; these labels do not report every absorbed property-access exception. Readiness,
transport calls, retry behavior and observation/lease limits are unchanged.

[Confirmed] The first new Ruffle error test failed on both providers: Haxe's Flash `Std.string`
catches an anonymous object's `toString` exception, so the supposed bad name was accepted. A
sealed throwing-name fixture now asserts conversion throws before exercising the bridge. Both
provider scenarios then passed, independently identifying an outer getter E1014, nested names
E1010 and subscription E1006 without private exception text. These codes are **injected test
values, not native errors observed in Fallout**. Failed observations do not create membership
or issue controls. Both scenarios require the explicit `BRIDGE-ERRORS PASS` marker in addition
to the earlier continuity, push divergence, read-only menu and teardown assertions.

Local verification: 47 pure bridge-state checks, both endpoint package tests, all 20 widget Haxe
suites, shared native API/auth tests, widget package/emoji/source/archive checks, 41 backend
bridge tests, 1,150 overlay tests and six dashboard bridge-feed tests passed. The initial full
Ruffle run had 26 passes and the two fixture failures above; the corrected complete run passed
all **28 tests in 42.3 seconds**. No project compiler diagnostics; the same two Haxe standard
library warnings remain. Existing package-helper ResourceWarnings remain. The required
`gamemod-anchors` and `hud-ruffle` CI jobs already include these suites; hosted CI was not run.
Playwright shut down its server, and a successful bind/close of loopback port 41739 verified
teardown. No game input or hosted messages were automated.

Prepared `/tmp/fcm-roster-read-failure-cxS4sq/FCM-Server-Bridge-0.1.4-DEV.zip` (28,727 bytes):
ZIP SHA-256 `163358d854d458ae526463105f964f2850a27993233ac4ddd97f02f9a9adcd80`.
Its sole archive entry is `Interface/FCMServerBridge.swf`, 43,731 bytes, FWS v32, 400x300,
30 fps, one frame, seven tags. SWF SHA-256
`14ace48c3e4a9d8ffd6ad3b189aaadc9f50610f043a0b1649d7ac8afb1d1c0c1`;
BA2 SHA-256 `25c497a08222c557ff45342e0096233eca666b930a0d33c28e6faebbd289a142`.
The package validated exact decoded SWF equality, archive structure and DEV endpoint/config
stamps. Evidence and decompiles are under `/tmp/fcm-roster-read-failure-cxS4sq/`.

Fallout was still running at the final check, so nothing was installed. The active bridge remains
0.1.3; game configurations, native authentication, Dev/Prod overlays and hosted services were not
changed. No commit, push, deployment or publication occurred. Next: obtain game-closed confirmation
and installation approval, install the tested candidate with exact-target backups, then capture
its F11 phase/error/subscription rows. Do not repeatedly reconnect or include a link code.
The underlying roster exception and prior native freeze remain unresolved.

### Authorized local installation of diagnostic 0.1.4

After the user requested installation, process checks found no Fallout game process. The exact
tested ZIP above was extracted to `/tmp/fcm-bridge-014-install-n1DQO3/`. Its manifest, DEV link
stamp, normalized SWF structure and both payload hashes were verified before copying. No source
or artifact was rebuilt; the preceding full regression gate applies to this same package.

[Confirmed] Replaced only `Data/FCMServerBridge.ba2`, `FCMServerBridge.build.json` and
`FCMServerBridge-INSTALL.txt` (the latter two are beside the game executable, not inside Data).
Byte comparisons against the extracted ZIP all passed. The installed BA2 SHA-256 is
`25c497a08222c557ff45342e0096233eca666b930a0d33c28e6faebbd289a142`.
The old three files and configuration snapshots are recoverable under
`.extender-backups/before-bridge-0.1.4-nZQRvv/` in the game directory.

Comparisons prove `Data/hudmodloader.ini`, `xscal.ini` and the active Proton
`Fallout76Custom.ini` are unchanged. The single active bridge still uses xScal and
`wss://dev.falloutchatmod.com/relay`. Native credentials, extenders, overlays and hosted services
were untouched. Initial `ps` and final separate exact-name checks confirmed Fallout was closed;
use separate `pgrep -ix Fallout76.exe` / `pgrep -ix Fallout76` checks, since a longer combined
regular expression triggers pgrep's process-name length warning and must not be trusted as a guard.

Next manual acceptance: launch Fallout, enter a world, open F11 → FCM Server Bridge and verify
`Bridge 0.1.4 - xscal`. Capture the subscription count and Menu/Roster/provider phase/error rows,
excluding any link code. Do not repeatedly press Reconnect. This installation does not establish
that Server chat works or the earlier freeze is fixed. No commit, push, deployment or publication.

## 0.1.4 native processor-entry E1014 and 0.1.5 preparation

[Confirmed, 2026-09-16] The new user screenshot shows `Bridge 0.1.4 - xscal`,
`Subscriptions - 8 of 8`, `Menu - world allowed`, `Roster - not observed`, and
`processor entry E1014` for all six roster sources. The main status remains waiting for a
fresh world roster. This fails native roster acceptance; successful subscriptions alone are
not a successful read, fresh roster or confirmed room.

[Confirmed] The ActionScript runtime reference defines E1014 as `Class _ could not be found.`
([HARMAN-maintained reference](https://airsdk.dev/reference/actionscript/3.0/runtimeErrors.html)).
The active BA2 still has SHA-256
`25c497a08222c557ff45342e0096233eca666b930a0d33c28e6faebbd289a142`.
Read-only extraction matched SWF SHA-256
`14ace48c3e4a9d8ffd6ad3b189aaadc9f50610f043a0b1649d7ac8afb1d1c0c1`.
FFDec 26.3.0 pcode export confirms the failing roster branch goes directly from the
`processor entry` label to `FcmBridgeState.observe` with six arguments; the normal getter and
push-cache work precede that label. The method exists, and its directly referenced packaged
helper classes are present. No missing class was identified by that file inspection. The
method's `flags` phase has not been reached in the screenshot. Native class resolution or
method-entry verification is the narrowed investigation boundary, not a proven absent file.

0.1.5 is **prepared, not installed and not a functional fix**. It adds one read-only cached
`Missing class` menu row for the latest E1014, using only a class identifier parsed from the
exact standard error template. It rejects absent/non-string/overlong messages, additional
stack text, URLs, menu delimiters and identifiers outside its bounded ASCII format. Unrecognized
or localized/numeric-only errors display `not reported`. It does not expose the full error or
change roster, provider, transport, retry or lease behavior. The parser cannot guarantee the
game supplies a usable class name. Both actual AVM2 Error-accessor tests and pure parser/reset
tests pass; these are injected errors, not a native reproduction.

The shared bridge scenario currently compiles the bridge and widget classes into one harness
movie (only the bridge is instantiated for this scenario). It does not exercise the packaged
bridge in an isolated GFx application domain. Its passing result cannot establish native class
resolution, and neither Ruffle nor the static artifact check identifies the missing runtime
class here. Do not claim this native failure is fixed or that subscriptions are broken.

Local checks: 61 pure bridge checks, both endpoint package tests, all 20 widget Haxe suites,
widget package tests, shared native API/auth tests, anchors/BA2/SWF tests, 41 backend bridge
tests, 1,150 overlay tests and six shared-renderer bridge-feed tests passed. Full Ruffle:
**28 passed in 37.3 seconds**, with automatic teardown verified by rebinding port 41739.
The first overlay command used absent `npm test` and ran no tests; corrected
`npm run test:unit` passed. Compiler diagnostics report no project-file issues, with the same
two Haxe standard-library warnings. Existing BA2 helper ResourceWarnings remain. The existing
required CI jobs cover these suites; hosted CI was not run.

Prepared `/tmp/fcm-bridge-e1014-JiGirF/FCM-Server-Bridge-0.1.5-DEV.zip`, 29,171 bytes. Its sole
entry is `Interface/FCMServerBridge.swf`, 44,392 bytes, FWS v32, 400x300, 30 fps, one frame,
seven tags. SWF SHA-256 `40cdead94f55ea19c13a8740fd4ef8dd4d27e4d0c30b01053f04c0ba2603cbf7`;
BA2 SHA-256 `d6123293ed342c11724e8b96a29d81838508d4590e5aef64a51e55a8d86827d9`.
The packager validated target stamps and exact decoded SWF equality. Decompiles/test logs
are under `/tmp/fcm-bridge-e1014-JiGirF/`. Installed 0.1.4, extenders, configs, credentials,
overlays and hosted services were unchanged. No game input, messages, commit, push or deploy.

Next native evidence, after an authorized game-closed install, is the new `Missing class` row
alongside the phase/error and subscription rows. If no identifier is supplied, it remains
unproven; do not replace native DLLs, weaken readiness or extend leases on this evidence alone.

### Authorized local installation of diagnostic 0.1.5

The user approved installation. Separate exact process-name checks confirmed Fallout was closed
before backup and again immediately before replacement. The existing single-bridge registry and
archive list still selected FCMServerBridge with HUDModLoader; xScal still targets hosted Dev.

[Confirmed] The tested ZIP SHA-256 is
`1f8fec07f991babf425e42b3494c91ae06d67c3f58c13bfeba8701949ec471d9`.
It was extracted to `/tmp/fcm-bridge-015-install-8iALCS/`; the DEV manifest/link stamp, normalized
SWF structure and both expected payload hashes were validated before copying. Replaced only
`Data/FCMServerBridge.ba2`, `FCMServerBridge.build.json` and `FCMServerBridge-INSTALL.txt`
(the latter two beside Fallout76.exe). All three installed files match the tested ZIP exactly.
Installed BA2 SHA-256:
`d6123293ed342c11724e8b96a29d81838508d4590e5aef64a51e55a8d86827d9`.

The previous 0.1.4 files and configuration snapshots are recoverable under
`.extender-backups/before-bridge-0.1.5-vt85XD/` in the game directory. Byte comparisons confirm
`Data/hudmodloader.ini`, `xscal.ini` and active Proton `Fallout76Custom.ini` were unchanged.
Native credentials and extenders were untouched, as were both overlays and hosted services.
No rebuild or source change occurred during installation; the preceding 61-check/28-Ruffle
regression gate applies to this exact artifact. No game input, commit, push or deploy occurred.

Native acceptance remains pending. Manually enter a world and open F11 → FCM Server Bridge.
Confirm `Bridge 0.1.5 - xscal` and capture the `Missing class` row together with subscription,
Menu/Roster and provider phase/error rows. Exclude any link code and do not repeatedly press
Reconnect. A successful install does not establish a functional Server room or resolve E1014.

## 0.1.5 native failure and shared-collector architecture (2026-09-16)

[Confirmed] The user's subsequent screenshot shows `Bridge 0.1.5 - xscal`, eight of eight
subscriptions, `Menu - world allowed`, `Roster - not observed`, `processor entry E1014` on all
six roster sources, and `Missing class - not reported`. This fails native acceptance. The last
row means the allowlisted parser did not obtain a class identifier; it does not prove the
exception had no message or identify a missing class. Attachment suffix:
`a51dc7ad-409b-459e-85e9-b406a09352fa.png`.

The user approved stepping back architecturally, then implementing the shared-collector design.
Source candidates are bridge **0.1.6** and widget **2.10.103**. `FcmHudRosterReader` unifies the
bounded roster decoder, copies names into observations and retains native payload references
only inside the game-facing collector. `FcmBridgeState` now receives decoded menu/roster values,
retains numeric local revisions instead of native data, and defensively copies emitted arrays.
Unchanged cached reads do not advance observation time. Fresh pushes/change evidence advance
revisions; older auxiliary evidence cannot move freshness backward. Invalid/damaged lists cannot
establish empty/partial membership. Thrown roster reads use capped per-source backoff without
lengthening observation/lease limits. Native transport and backend authorization are unchanged.

[Confirmed] The independent packaged host compiles without FCM production dependencies and
loads the real package's decoded child into a fresh application domain. Its initial positive
runs passed under both local mock adapters. The full combined+packaged suite then passed
31 tests; final expanded verification is recorded below. During test development, the first
packaged-driver run failed because `allowNetworking: internal` prevents ExternalInterface.
Enabling it only for the dedicated host, with nonlocal test requests blocked, allowed the driver
to observe actual packaged bridge behavior. This is a harness correction, not evidence about
Fallout's E1014.

The installed 0.1.5 game files, native credentials, extenders, both running overlays and hosted
environments were not modified. There was no game input automation, deployment, commit or push.
The candidate still needs an authorized game-closed installation followed by fresh manual native
acceptance; neither the earlier freeze mechanism nor the missing class has been established.

### Final local verification and native-failure control

[Confirmed] The versioned candidate passed all **33 Ruffle tests** (1.3 minutes), **66 bridge-state
checks**, **36 reader checks** (within 21 widget Haxe suites), native API/auth checks, source
anchors, emoji catalog/embedded assets, SWF/BA2 checks and all three bridge package tests for both
targets. Backend: four suites/41 tests; overlay: 41 files/1,150 tests; dashboard bridge feed:
six tests. Haxe diagnostics reported no project-code issues; installed standard-library warnings
and the existing archive helper's file-handle ResourceWarnings remain. Hosted CI was not run.

The five packaged tests verify exact package bytes/host isolation plus two provider-specific
lifecycle tests and two unready-provider recovery tests. Production timers drive the lifecycle;
poll counts stop after unload across more than two timer periods. Port 41739 was independently
bound and closed after teardown, confirming the owned server was released.

[Confirmed] As a negative control for native-compatibility claims, the installed failing
**0.1.5** SWF was extracted read-only (SHA-256
`40cdead94f55ea19c13a8740fd4ef8dd4d27e4d0c30b01053f04c0ba2603cbf7`). It also passed both isolated
packaged lifecycle tests (31.7 seconds). Therefore this harness does **not reproduce E1014**;
do not claim the new candidate fixes that exception from these tests. The generated test child
was restored byte-for-byte afterward. The installed archive hash remains
`d6123293ed342c11724e8b96a29d81838508d4590e5aef64a51e55a8d86827d9`.

Prepared DEV candidate: `/tmp/fcm-shared-roster-ZpnCs1/FCM-Server-Bridge-0.1.6-DEV.zip`, 30,281 bytes.
Its decoded FWS v32 SWF is 46,097 bytes and matches the final tested child exactly:

- ZIP SHA-256: `6e3b99c000d764041f2f0d130f199b4b52f4b10d1f00f950c9f14f04f242f6ed`.
- BA2 SHA-256: `b525cd641299a6c9775db94b659f610a17b16e513980e4886f7064288cbd026b`.
- SWF SHA-256: `d5a49b3e35bb995411d791780eb03daa368157d68f1eea0e10265588efa2bd44`.

Evidence and the prior generated widget BA2 are under `/tmp/fcm-shared-roster-ZpnCs1/`.
Next acceptance is deliberately small: one fresh native roster, matching backend room/lease,
then the same-account Dev overlay binding. Only after that passes, expand to two-client isolation,
same-world travel, hops, expiry and both extenders. Do not coinstall the visible widget or accept
old logs as evidence for 0.1.6. No installation or hosted change was performed in this refactor.

### Authorized 0.1.6 DEV installation

The user then requested installation. Separate exact process-name checks confirmed Fallout was
closed before backup and again immediately before copying. The tested 30,281-byte ZIP above
retained SHA-256 `6e3b99c000d764041f2f0d130f199b4b52f4b10d1f00f950c9f14f04f242f6ed`.
Fresh extraction to `/tmp/fcm-bridge-016-install-pXqOwd/` verified the DEV manifest/config stamps,
FWS v32 structure and decoded SWF equality with the tested candidate before installation.

Replaced only `Data/FCMServerBridge.ba2`, `FCMServerBridge.build.json` and
`FCMServerBridge-INSTALL.txt` (metadata beside Fallout76.exe). All three installed files compare
byte-for-byte with that ZIP. Installed BA2 SHA-256:
`b525cd641299a6c9775db94b659f610a17b16e513980e4886f7064288cbd026b`.

The previous 0.1.5 bridge and three configuration snapshots are backed up under
`.extender-backups/before-bridge-0.1.6-ZWFYVW/` in the game directory. `Data/hudmodloader.ini`,
`xscal.ini` and active Proton `Fallout76Custom.ini` remain byte-identical to those snapshots:
the sole FCM loader entry is FCMServerBridge, archives remain HUDModLoader plus FCMServerBridge,
and xScal remains enabled against `wss://dev.falloutchatmod.com/relay`. Native credentials,
extenders, both overlays and hosted services were untouched. No source/artifact rebuild,
game input, commit, push or deployment occurred during installation.

Native acceptance remains pending: manually enter a world and check F11 → FCM Server Bridge
for `Bridge 0.1.6 - xscal`, roster status, room confirmation and the Dev overlay Server tab.
If it still fails, capture the fixed diagnostic rows without link codes. Do not repeatedly
press Reconnect. The preceding 33-test Ruffle gate applies to this exact installed artifact,
but does not certify a native fix for E1014 or the previous freeze.

### 0.1.6 native result — payload boundary still failing

[Confirmed] The user's fresh screenshot, attachment suffix
`9e28b8e8-90fc-4d8e-9ea4-464c938f305e.png`, shows `Bridge 0.1.6 - xscal`, eight of eight
subscriptions, world allowed, no observed roster and `Missing class - not reported`.
Voice area, Party list, Public teams and Map report `payload E1014`; Team markers and
Player list report `test provider`. Native roster acceptance has failed. No freeze was
reported with this screenshot; it does not resolve the earlier freeze investigation.

[Confirmed] A new read-only hash check matches the installed BA2 to the tested candidate:
`b525cd641299a6c9775db94b659f610a17b16e513980e4886f7064288cbd026b`.
The 709-byte `xscal.log`, modified 2026-09-16 05:33:00 UTC, contains no FCMServerBridge,
0.1.6 phase, E1014 or roster entries. Its absence of diagnostic output does not contradict
the screenshot or demonstrate a transport failure. No native settings or credentials were read
or changed for this investigation.

[Confirmed] Source and exact-candidate FFDec AS3/P-code inspection show that
`FcmHudRosterReader.provider()` sets `payload` before reading `data` and calling `payload()`.
The latter constructs `FcmRosterObservation` before setting `list shape`. Thus this diagnostic
does not identify a particular failed getter, field or class. `test provider` is returned when
the envelope's `isTest` flag is true, before attempting payload decoding; it is not evidence
of an installed simulator. The inspected loader's BSUIDataManager also creates an `isTest`
placeholder when a native provider watch is unavailable, so subscription registration alone
does not establish usable live data. AS3/P-code evidence:
`/tmp/fcm-016-native-payload-jUPoL5/`.

[Hypothesized] GFx method-entry/class verification in the decoder could explain failure before
`list shape`. This remains unproven. The next discriminating native diagnostic is a small,
no-network synthetic-payload probe invoking the same compiled decoder, with separate phases for
payload acquisition and decoder entry. Failure on synthetic data supports a compiled-runtime
problem; success there and failure only on game-owned data redirects investigation to that
boundary. It must not accept synthetic names as a live roster, send them, bypass readiness or
extend a lease. No such probe was built or installed in this investigation.

Only documentation was updated to record failed acceptance. No source rebuild, test rerun,
installation, game input, extender/overlay change, hosted mutation, commit, push or deployment
occurred. The preceding local regression results remain valid only within their stated limits.
