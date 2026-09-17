# Automated HUD-mod test harness plan

Latest drop-in bridge evidence: [rollout, fallback and diagnostic candidates](bridge-drop-in-acceptance-2026-09-16.md).

## Required change-to-install flow

Every visible HUD widget or background FCMServerBridge change follows this sequence; shared
roster/native-adapter changes exercise both consumers. Do not skip directly from source edits to
a game install:

1. Add or update pure Haxe tests for parsing, matching, state gates, and provider-neutral logic.
2. Compile with Haxe diagnostics and build the production SWF.
3. Normalize and structurally validate the FWS v32 artifact, including emoji linkage.
4. Run all `test-*.hxml`, package/anchor/BA2 tests, and the full `simulator/npm test` Playwright
   suite. Cover both xScal and ZFE whenever changed behavior crosses providers.
   Preparing the isolated bridge test builds a temporary package and extracts its exact child;
   this is a test input, not an installable/distributable candidate until all gates pass.
5. Verify teardown: the owned Vite server, page, player, and browser close after the run; failure
   artifacts are retained without leaving a listener on port 41739.
6. Rebuild the one-entry BA2 with the validated SWF, extract it, and require byte equality.
7. Generate the requested target package, inspect its endpoint/config stamps, and preserve unrelated
   game configuration during an authorized local install.
8. Record remaining bounded in-game checks. Ruffle cannot certify Bethesda GFx font metrics,
   HUDMenu handled-return ordering, provider DLL behavior, or Fallout control suppression.

Any failing step blocks packaging and installation. New harness-testable HUD behavior must add
Playwright coverage in the same change and run in the required `hud-ruffle` CI gate.

For the background bridge, also run `haxe test-state.hxml`, `haxe test-export.hxml`, bridge compiler diagnostics and
`python3 test_package.py` in `hudmodloader-bridge/`. Build a **fresh** target ZIP with its
`package.py`; compare the installed BA2 and decoded SWF to that ZIP's `BUILD.json`, not an older
same-version package. Run backend `overlayServerBridge`, `serverMessageService`, `bridgeConnection`
and `gameBridge` Jest suites, dashboard `bridgeFeed` Vitest tests, and overlay unit tests before
the desktop/bridge handoff. The existing backend/dashboard and `gamemod-anchors`/`hud-ruffle`
jobs cover these gates. A local pass is not a hosted CI pass.

For a manual Dev test, use the [isolated packaged Dev overlay workflow](../deployment/local-dev.md#packaged-dev-overlay-for-bridge-acceptance),
disable the visible widget before enabling the invisible bridge, and sign into the overlay only.
Use two distinct accounts for mixed-client room acceptance. Keep the user-requested desktop overlay running for acceptance; tear down the
automated harness and any diagnostic-only sockets/processes. Never stop or automate the game.

## Isolated packaged bridge gate

Bridge 0.2.0 retains 0.1.7's native-accepted split reader, not the unified method
rejected by GFx. Its source gate requires `FcmRoster.readNames` for map/public teams and separate
auxiliary traversal, and prohibits native payload retention in the reader cache. Pure tests
prove wrapper replacement cannot renew unchanged observations; explicit fresh pushes still can.
Both compiled `bridge-fast-travel` scenarios exercise all six sources and reject throwing names
without replacing/renewing prior snapshots before emitting the required `BRIDGE-ERRORS PASS`.
Keep this gate plus the isolated packaged tests; neither emulates native method verification.

`npm test --prefix game-mods/FCMBridge/hudmodloader-chat/simulator` also runs
`tests/packaged-bridge.spec.ts`. Preparation builds a temporary DEV ZIP using the real bridge
packager, extracts its BA2 child, and compares SHA-256 to `BUILD.json`. The generated child and
manifest remain ignored test artifacts; owned temporary packaging directories are removed in
`finally`, including on build failure.

`isolated/PackagedBridgeHost.hx` compiles without production class paths or shared mocks. It
loads that exact child into `new ApplicationDomain(null)` and asserts that the host has no FCM
class definitions before or after loading. Accessor-backed providers/events cross the movie
boundary, rather than being compiled alongside the consumer. Only public provider calls,
production timer ticks, scoped storage writes and subscription ownership are observed; there
are no `@:access` calls into the packaged bridge.

Both storage adapters must pass bounded initial export, unready-provider rejection/recovery,
loading/resume without generation churn, disjoint generation change, inactive MainMenu export
and unload. No native chat/auth call is allowed. Unload releases subscriptions/timers and stops
writes; rate-limited final inactive writes rely on desktop exit/expiry cleanup. The combined harness remains necessary for
exact boundary/expiry, malformed data, push/getter divergence, exception-backoff and other
state-focused scenarios. Pure `test-roster-reader.hxml` runs in `gamemod-anchors`; all packaged
cases run automatically in the existing required `hud-ruffle` gate.

The 0.2.1 regression requires an isolated `BRG_OBJ`-only host with no modern ZFE
aliases. It must export, preserve a loading/resume generation and stop on unload.
A second case withholds `zfe-storage-v1`: writes must remain zero until a fresh
capability probe confirms support. Pure tests also reject malformed/failed/throwing
responses and preserve xScal/modern-ZFE priority. Native fallback storage support
remains a separate acceptance check; mocks cannot establish that support.

0.2.2 adds isolated native-call-exception and malformed-runtime-reply scenarios.
Observe the child's public read-only diagnostic method, require distinct fixed labels,
zero writes before capability recovery, no private exception/reply text, and teardown.
Do not link production helpers into the host or use diagnostics to bypass capability
gates. Native method-entry verification remains outside Ruffle's certification scope.

0.2.3 additionally rejects oversized runtime replies before capability acceptance and tests
recovery, formatted/escaped capabilities, and bounded write-ack decoding. Package and isolated
artifact checks require `FcmJson` and reject `JsonParser` linkage, guarding the generic-parser
dependency seen at the native 0.2.2 parse failure. Ruffle does not reproduce native E1014.

Native-failure control (2026-09-16): the installed 0.1.5 bridge, which fails in Fallout with
E1014, also passed the isolated packaged lifecycle tests under both mocks. The expanded suite
closes a package/domain coverage gap but **does not reproduce or certify a fix for that native
exception**. See the [dated evidence](hud-xscal-acceptance-2026-09-15.md#final-local-verification-and-native-failure-control).

The browser driver needs `allowNetworking: all` for ExternalInterface; URL opening stays denied
and Playwright blocks non-loopback HTTP requests. See [Ruffle's networking contract](https://ruffle.rs/js-docs/master/enums/Config.NetworkingAccessMode.html).
This mode does not load hosted snapshots or call live relay services. It validates the package
and mock transport contract, **not** native ZFE/xScal scheduling, GFx class availability, a hosted
lease or actual desktop delivery. Complete those using the separate backend/renderer tests and
bounded manual two-client native acceptance. No game input automation is used.

## Shared HUD/bridge compatibility gate (0.2.0+)

One room-assignment coordinator serves native HUD ROSTER and authenticated local-export
observations. Test HUD/ZFE ↔ bridge/ZFE, HUD/ZFE ↔ bridge/xScal, HUD/xScal ↔ bridge/ZFE,
HUD/xScal ↔ bridge/xScal, plus HUD↔HUD and bridge↔bridge. Require equal canonical rooms,
bidirectional exactly-once publication and shared retained history after mutual discovery.
Use real assignment/history/publication services in integration tests, not mocked room IDs.

Cover isolated worlds, one-sided/missing sightings, delayed convergence, repeated fast travel,
world hops, expiry and stale confirmations. File-reader tests must cover oversized/malformed/
stale exports, nonadvancing heartbeat, old files at startup, provider storage failures, both
startup orders, auth replacement, game exit and teardown. Same-observation heartbeat cannot
extend the original observation deadline. CI's backend Jest, overlay/dashboard Vitest,
gamemod-anchors and hud-ruffle jobs own these gates.

Backend support goes to hosted Dev before isolated desktop builds. Install only while game
closed with exact backups/artifact checks. Manual Steam Windows and Linux/Proton acceptance
must measure native storage timing and repeat the mixed matrix; Game Pass is unverified.
Simulator success cannot certify native stability. No production changes or game input automation.

## Existing simulator coverage

Status: M0, the Nexus xScal 0.2.16 browser contract fixture, and the ZFE 0.15.0 provider contract
are implemented, updated 2026-09-15;
rendered widget-to-provider integration remains pending.
This does not claim native Fallout 76, ZFE, xScal, or GFx
acceptance. It defines a layered simulator plus an optional real-game smoke runner.

The implemented M0 runner lives in
`game-mods/FCMBridge/hudmodloader-chat/simulator/`. It self-hosts pinned Ruffle 0.6.0, copies and
hashes the exact normalized production SWF, renders it in Chromium, records browser key delivery,
captures evidence, and lets Playwright own and tear down its strict loopback server. The current
artifact test completes in roughly two seconds locally. An isolated Haxe contract-host prototype
is retained behind `?mode=harness`. The in-movie mock xScal object is discovered by the production
widget and can drive its connect/poll/render path. Its `allowNetworking: internal` setting blocks
ExternalInterface browser interaction by design; the earlier attribution to an emulator
compatibility limitation was not established. The isolated packaged-bridge host below explicitly
enables that driver with nonlocal requests blocked by its tests; this does not upgrade the older
widget key-delivery tests into native input acceptance. Harness diagnostics are retained in a bounded in-memory field;
they must never use Haxe `trace()`, because Ruffle paints trace output over the HUD stage.
The browser laboratory scales its complete 16:9 stage to the available workspace width; it must
not crop the right edge when the evidence sidebar is visible or when the viewport narrows.

For an explicit hosted-DEV history check, run `npm run sync:hosted-dev` in the simulator before
starting it. The sync process reads the DEV persona key from `DEV_PERSONA_LOGIN_SECRET` or the
existing `service=fcm-overlay, environment=dev` OS-keyring entry, creates a short-lived synthetic
DEV session, honors the hosted golden-build version gate, and requests up to 300 rows for each
ordinary channel. It writes only a gitignored `public/hosted-dev-snapshot.json` containing the
isolated environment's fake chat rows; the key and session token are never written or sent to the
browser/SWF. Harness mode loads this same-origin snapshot into the mock xScal queue. This is a
point-in-time history fixture, not a persistent live connection, and it never targets production.
The sync retains the latest 50 rows independently per channel, merges those channel batches by
`created_at`, normalizes backend channel names to HUD slugs, and returns at most 16 records per
`pollEvents` call. This preserves coverage of every populated channel without feeding an unbounded
300-row General batch through repeated immediate render generations. The current DEV seed produces
75 retained rows, matching the scale of the fresh 75-record native xScal capture. Both simulator
and distributable HUD retain the normal 200-row default.
Manual compose uses real keyboard delivery into the SWF because Ruffle does not expose the
harness's AVM2 callbacks to the browser. The right-panel Open chat/Up/Down/Page/Delete controls
focus the player and emit the corresponding browser key edges; a physical Insert key works after
the stage is focused. The harness translates supported keys into both the bubbling
`HUDMod::UserEvent` shape and numeric `Input.*` state, exercising the two input surfaces used by
ZFE and xScal without claiming suppression of gameplay controls. `SharedHUDTools` owns the visible
editor, Enter submits, and Escape cancels. The mock provider queues an authoritative self-echo
with the returned message ID. This never sends input to the desktop, Fallout process, or hosted
DEV backend.

`npm run dev:hosted` is the explicit write-enabled variant. Its Vite middleware holds the
short-lived synthetic DEV session server-side, accepts only loopback-origin requests, validates
the allowlisted HUD channel and 1..500-character body, opens a DEV WebSocket with the active
golden-build header, sends `chat:send`, waits for `message:ack`, and closes the socket. The SWF sees
only the same-origin send endpoint; credentials and session tokens never enter browser content.
The ordinary `npm run dev` remains local-mock-only and cannot write remotely. The evidence panel
shows `Hosted DEV: LIVE` only after the bridge authenticates successfully.

The generated simulator copy of `FCMChat.ini` disables inactivity auto-hide so a healthy idle
widget stays observable during long browser runs. The source/package config retains the normal
60-second in-game auto-hide behavior; the simulator-only override is never packaged into a BA2.
The right-panel keybind profile editor similarly changes only an in-memory simulator profile.
Applying it regenerates the served INI and reloads the same widget. Its buttons emit both the
configured named HUD action and matching Windows virtual-key edge, allowing the same profile to be
replayed through xScal and ZFE; duplicate and unsupported active bindings are rejected before reload.
The harness also exposes deterministic container/all HUD-mode transitions for tests. Current CI
checks the compiled provider routes, key delivery, file-versus-persisted precedence, and both
production HUD-mode guards. Ruffle 0.6.0 does not expose this AVM2 movie's inbound callbacks, so a
browser test must not claim that an internal editor-state assertion is real-game acceptance.
For the burst renderer, pure planning tests and simulator source-contract assertions enforce that
prefix rows move only at commit, visual state invalidates reuse, and timer listeners are detached.
The Ruffle suite still catches artifact-load and input regressions; visual continuity during a
large sliced append remains a required GFx/in-game acceptance check.

The `fast-travel` scenario runs assertions inside AVM2 against the real `FCMChatWidget`, using
the selected native adapter and mock `BSUIDataManager` cache/CHANGE events. It covers both ZFE
and xScal: initial Server history through max-16 polling, Loading → All with empty/disjoint
auxiliary lists, temporary empty primary then recovery, preserved tab/history/session nonce,
no extra controls, a genuinely disjoint map roster despite stale auxiliary names, rebind,
expired grace/lease (test-owned timestamps advanced), solo recovery, and an immediate MainMenu
leave. Pure `TestFcmRoster` tests (also called by CI's `test-history.hxml`)
cover source priority, TTL expiry, solo binding, and exact empty-grace boundaries.
The 2.10.102 regression adds the native xScal sequence where MapMenuData stays empty beyond
grace while PublicTeamsData remains populated. An overlapping fallback must preserve room,
nonce, selected Server tab and history without redundant controls; disjoint cached public teams
must not conceal a populated new-world primary or bypass an empty primary's bounded recovery.
The same scenario runs against the invisible bridge, with its unchanged 30-second limits.
Both scenarios now repeat map recovery → loading → empty map/overlapping public teams three
times per provider. Each cycle asserts the **selected provider** changes from MapMenuData to
PublicTeamsData, clears the empty timer, preserves the original nonce/room and sends no redundant
ROSTER/LEAVE. The HUD additionally retains the exact original history object and the attached,
visible, selected Server tab. The bridge remains invisible and owns no editor. Playwright requires
all three named cycle-pass markers plus the terminal scenario pass, so a skipped cycle or a
transient clear/rebind cannot be concealed by an eventually healthy final state. Test-owned
timestamps reach the grace boundary without adding real-time waits or extending production TTLs.
That 2.10.102 suite contained 28 tests and passed locally in 36.2 seconds on 2026-09-15; port 41739
was successfully rebound after teardown. The production 2.10.110 suite has 37 cases. Added cases
exercise timer-driven delayed authentication on both providers, xScal queue retirement versus real
forward gaps, and retained-local-row cosmetic refresh without same-name identity bleed. Existing
hop/expiry/MainMenu assertions still run
**after** the repeated cycles, with stale auxiliary/public-team names present.

Native 2.10.102 xScal logs subsequently confirmed two normal same-world loading transitions
without a room reset, but MapMenuData stayed populated. That supports ordinary fast-travel
continuity, **not** native acceptance of the empty-map fallback; keep the latter explicitly
pending in the [acceptance record](hud-xscal-acceptance-2026-09-15.md).

The harness reads provider/scenario parameters from the loaded movie, not its unattached Sprite
(whose `loaderInfo` is null). Tests assert the actual discovered adapter matches the requested
provider. Ruffle 0.6.0 ignores `traceObserver` before its instance exists; install it after
`load()` and report delayed scenario results with `flash.Lib.trace`, not Haxe's on-stage debug
field. This supplies real internal assertions without relying on unsupported inbound callbacks.
The deterministic scenario skips hosted snapshots and never sends a live message. Test timers
stop on success/failure; normal player/browser/server teardown remains automatic. Packaging
asserts the scenario driver is absent from the production SWF. Real GFx/native scheduling and
actual server identity still require manual in-game acceptance.

For the invisible background mod, `scenario=bridge-fast-travel` loads `FCMServerBridge` instead
of `FCMChatWidget`. Its ready-provider mock drives real cache/CHANGE subscriptions through the
two storage provider mocks. Both adapters preserve the generation through short loading
and primary-empty recovery, retire it on a disjoint full roster, expire prolonged loading,
invalidate MainMenu evidence, and release owned subscriptions/timers on shutdown. No chat UI/editor or
live traffic is created. Run the full suite for bridge changes as well as visible-widget changes;
the existing required `hud-ruffle` job includes both scenarios. The visible scenario additionally
asserts `SERVER` exists in its visible, attached tab text field after a room confirmation.

Retained regressions from 0.1.2 use sealed, AS3-style getter-backed provider/event classes,
fresh `fromClient` pushes while `GetDataFromClient` remains stale, original observation-time
expiry, test-provider rejection, duplicate menu reconnect requests and nested getter callbacks.
`BRIDGE-EVENTS PASS` is required on both providers. A healthy reconnect refresh must neither
disconnect from the menu dispatch stack nor discard the established room/cursor. Timers and
subscriptions still terminate on success/failure. These tests cover AVM2 control flow, not native
native storage latency or the cause of a Fallout freeze. The 0.2.0 bridge has no native
connect/disconnect/send path; status is cached in the loader menu.

Bridge 0.1.3 adds `BRIDGE-DIAGNOSTICS PASS` to both provider scenarios. The mock retains the
actual loader menu preparation callback and records its rows; assertions require the correct
version/provider and rejection reason, eight bounded non-actionable diagnostic rows, no player
data, and no provider reads, controls, nonce changes or queued refresh when the menu is built.
Pure tests cover absent/test/unready/menu-loading/list-shape/expiry/read-failure reasons. The
diagnostic labels are cached from the normal observation path; they must not turn opening F11
into a new synchronous native call. This closes the diagnostic-coverage gap, not the still-unproven
cause of the native “Waiting for a fresh world roster” failure.

Bridge 0.1.4 additionally requires `BRIDGE-ERRORS PASS` on both providers. Actual AVM2 Error
objects exercise getter, nested name-processing and subscription failures with distinct numeric
IDs. Each attempt keeps its own phase; a nested callback cannot relabel the outer getter error.
Failed observations cannot create membership or send controls. The cached subscription row shows
successful registrations out of eight plus the latest numeric error, never exception text or
stack/payload data. Pure tests reject invalid, fractional, out-of-range and string error IDs.
The throwing conversion fixture validates its behavior before use: Flash Haxe's `Std.string`
swallows anonymous-object `toString` errors, so an anonymous fixture would falsely test success.
These injected codes are harness evidence only, not a reproduction or diagnosis of the native
0.1.3 screenshot's all-source `read failed` result.

Bridge 0.1.5 extends both error scenarios to test its cached `Missing class` row using actual
AVM2 Error accessors. Only the canonical E1014 class-identifier template is accepted; appended
stack/private text and other messages must show `not reported`. Pure cases cover bounds,
delimiters, non-string values, wrong error IDs and reset. This diagnostic must not establish a
room or send controls. The native 0.1.4 screenshot's processor-entry E1014 is not reproduced by
these injected errors. The combined harness links bridge classes into its movie, not an isolated
packaged bridge movie in GFx, so passing it cannot establish native class-resolution compatibility.

When a local Fallout 76 installation is found (or `FCM_FALLOUT76_DATA` points at its `Data`
directory), preparation extracts `programs/fonts_programs.swf` from the installed Interface BA2
into ignored, temporary simulator output and supplies it to Ruffle. Harness builds resolve the
game aliases directly to `Roboto Condensed` and `Roboto Condensed Bold`, matching the local
`fontconfig_en.txt`; production builds retain `$MAIN_Font`/`$MAIN_Font_Bold`. No game font is
committed or distributed, and Ruffle font metrics remain non-acceptance evidence.

Harness mode has an explicit xScal/ZFE selector. xScal exposes the observed
`__SFECodeObj.chatInterface` object-method contract and receives parsed ActionScript objects. ZFE
exposes `__ZFE.call`, positively answers `chat.v1.getRuntimeInfo` with
`zfe-chat-online-v1`, and receives JSON-string payloads for `chat.v1.*`. The production
`FcmNativeApi.discover()` and provider-specific call routing remain between the widget and these
mocks; the simulator does not call the localhost DEV bridge until the selected provider's real
`sendMessage` surface is invoked. Both mocks expose numeric `Input.*`, while the harness also emits
the loader's bubbling named user-event shape. “X-Cal” and “XS-Cal” are treated as references to the
same xScal provider, not additional invented extender contracts.

The public xScal source at upstream commit `2c073777b8399960122c4971694f5b6e8be2a8ba`
was evaluated and deliberately not retained as an emulator dependency. It provides the MovieRoot
hook, generic callback registry, and `GetXSRuntimeInfo`, but not the installed runtime's
`chatInterface`, relay client, plugin/module system, or `Input.*` surface. The emulator must instead
reproduce a sanitized, versioned contract observed from the Nexus xScal 0.2.16 DLL.

That fixture is `simulator/fixtures/installed-xscal-0.2.16.json`. It records the Nexus DLL's
version, SHA-256, byte size, supported Fallout runtime, exact chat method names, and numeric input
callback names without copying the DLL, endpoint, messages, account identifiers, or credentials.
The browser suite replays authentication gating, cursor polling, synthetic regular/Discord/event
links, Discord-ID targeting, sends, and Insert registration/pressed/unregistration semantics.

`hudmodloader-chat/native-capture/Capture-HudSession.ps1` supplies the native evidence loop. It
attaches read-only to a user-launched Fallout process, fingerprints the exact Fallout/xScal/widget/
HUDModLoader artifacts, tails only log bytes written after capture starts, sanitizes them in real
time, and records that it does not own the game process. It never launches, kills, or modifies the
game and does not copy the DLL. Its PowerShell sanitizer and incremental log reader run in CI.

Linux/Steam Proton uses the schema-compatible `native-capture/capture_hud_session.py`. It validates
the selected `Fallout76.exe` against the supplied installation through `/proc`, fingerprints the
same artifacts, records X11/Wayland session metadata, and tails the same fresh logs. It contains no
window-control or virtual-input integration and sends no process signals; `inputAutomation=false`
is explicit in every Linux manifest. Its process selection, sanitizer, tailer, and fingerprinting
are covered by Linux CI tests.

## Decision

Build a deterministic, browser-driven simulator around the exact production
`FCMChatWidget.swf`. Use Ruffle for AVM2 playback and a purpose-built mock host for HUDModLoader,
SharedHUDTools, ZFE, and xScal contracts. Use it for rapid UI, keybind, input, relay, screenshot,
and failure-path testing.

Do not name its output `zfe.log` or `xscal.log`: those names imply the native providers ran inside
Fallout 76. Emit `sim-zfe.log`, `sim-xscal.log`, JSONL events, screenshots, and a manifest containing
emulator and widget hashes.

Keep a smaller native acceptance tier. If a legally licensed Scaleform GFx 4.6 SDK/player is
available, add a custom GFx host between the simulator and the game. Otherwise use a dedicated
Windows machine with the real game for scheduled, supervised ZFE/xScal smoke tests.

## Feasibility and limits

- The widget already isolates provider discovery/routing in `FcmNativeApi.hx`; most state machines
  already have pure Haxe tests.
- HUDModLoader and xScal are open source, so their object shapes and callbacks can be represented by
  pinned contract fixtures.
- Ruffle runs AVM2 SWFs and provides desktop/web runners, headless screenshots, trace assertions,
  and browser tests for ExternalInterface behavior.
- Autodesk's GFx API supports host-to-movie invocation, movie-to-host callbacks, and explicit key
  and character event injection, making a licensed custom host technically viable.

A standalone player cannot generate authentic provider logs: the native DLLs must run inside the
real Fallout 76 process. Ruffle is not Bethesda's Scaleform build, so font metrics,
`scaleform.gfx.Extensions`, focus, clipping, and text layout can differ. Mock SharedHUDTools verifies
FCM's response to its contract, not actual HUDMenu forwarding or ControlMap suppression. A dummy
`Fallout76.exe` can test only the desktop overlay's process detector; it cannot load this HUD mod.

## Architecture

```text
Playwright scenarios
  ├─ key/character events and provider profile
  ├─ scripted relay replies, latency, disconnects and malformed data
  └─ screenshots/video, state probes and JSONL traces
                    │
                    ▼
Ruffle web player + FCM harness host
  ├─ exact built FCMChatWidget.swf
  ├─ MockSharedHUDTools (editor, menu, named HUD events)
  ├─ MockZFE (__ZFE.call and native-input fallback)
  ├─ MockXScal (chatInterface and generic Input.* dispatcher)
  └─ deterministic clock, relay queue, config store and log sink
```

The harness stays outside the production BA2. Any widget hooks must require an explicit
`fcm_harness` compile define, with a packaging test proving they are absent from production.

Provide two host modes:

1. **Contract host** — lightweight deterministic mocks, used by CI.
2. **Local loader-stack host** — attempts to load the user's locally extracted `hudmenu.swf`,
   `hudmodloader.swf`, and `HUDTools.swf`, with mocks only at game/native boundaries. These assets
   are proprietary/local inputs: never commit or upload them. Failure in Ruffle remains an emulator
   compatibility result, not evidence that the game files are defective.

Neither mode should be described as “running Fallout 76.” They emulate the widget's observed host
contracts. Only M5 runs Fallout 76.

## Milestones

### M0 — one-day compatibility spike

Pin a Ruffle release and SHA, load the current normalized SWF unchanged, capture its first rendered
frame and AVM2 trace, inventory missing APIs, and compare basic text bounds against an in-game
400×260 reference. Stop and choose the GFx-host route if required display/text primitives fail.

Run a second spike against the locally extracted loader stack. Record every missing game object or
callback needed to reach widget registration, rather than silently adding permissive mocks.

Exit: deterministic trace and screenshot artifacts, plus a written go/no-go for M1.

### M1 — provider contract simulator

Implement pinned fixtures:

- ZFE: `__ZFE.call(verb, JSON-string)` with runtime, auth, connect, poll, send, report, input,
  storage, timeout, and malformed-response cases.
- xScal: object/no-argument `chatInterface` methods plus a separate generic callback implementing
  numeric `Input.RegisterKey`, `Input.IsKeyPressed`, and `Input.UnregisterKey` Boolean results.
- SharedHUDTools: visible editor, balanced ownership, submit/cancel callbacks, menu actions, focus
  loss, and missing-submit-callback recovery.

Exit: identical scenarios pass for both profiles and prove provider calls never cross families.

### M2 — programmable UI and input

Automate Insert, text/space/punctuation, backspace/Delete, caret selection, Enter, Escape, Page
Up/Down, row Up/Down, held/repeated/aliased key edges, F11 settings, every binding alias, mouse
wheel, auto-hide, focus loss, reload, and stale callbacks. Cover ordinary/Discord/event links,
emoji/link rows, selected-row colors, resize, wrapping, and clipping.

Each scenario records key edges, mock calls, trace, semantic state, and screenshots. Use only a few
stable golden images; do not make the suite depend on Ruffle font pixels.

Exit: two clean headless runs produce identical semantic results.

## Performance budgets

Measure first, then gate regressions at the correct altitude:

- Advance the movie on a deterministic 30 fps virtual clock; never use wall-clock sleeps for widget
  assertions.
- Keep one browser/context per worker and reset the movie between scenarios. Do not launch a new
  Ruffle/browser process for every keypress or assertion.
- Capture semantic probes continuously, but screenshots only at named checkpoints and video only on
  failure or an explicit debug run.
- Shard the suite by provider and scenario group. Initial CI target: no more than three minutes total,
  1.5 GiB peak RSS per worker, and four workers; M0 records the baseline before these become gates.
- Preserve the widget's existing six-row render slices and instrument each slice. Flag a simulator
  regression above 8 ms or 20% over its pinned baseline, whichever is larger. Treat this as an FCM
  regression signal—not a prediction of native GFx frame time.
- Add 50/125/200/500-row scenarios, long wrapped messages, emoji-heavy rows, and rapid incoming
  batches. Report p50/p95/max render-slice duration, heap/RSS, dropped virtual frames, and artifact
  size.
- Block unexpected external network access. Use in-process fixtures by default; when testing the
  local backend, bind only to loopback on an OS-assigned port.

The local native log reviewed for this plan recorded 78–79-row snapshot completion around 95–99 ms
across scheduled slices and individual poll/render work around 67–68 ms. Those are end-to-end native
observations, not per-frame simulator thresholds; retain them as comparison evidence.

## Automatic teardown contract

Every run receives an unguessable run ID, dedicated temporary directory, exact child-process list,
and OS-assigned ports. Teardown runs from `finally` locally and an `if: always()` CI step:

1. stop scenario input and flush structured logs;
2. capture failure screenshots/video and the run manifest;
3. close pages, browser contexts, and the browser through their owning APIs;
4. request graceful shutdown from the loopback server and Ruffle process;
5. after a five-second deadline, terminate only PIDs recorded for that run, never by broad process
   name;
6. verify every owned PID exited and every allocated port can be rebound;
7. delete the run's temporary directory after artifact copying;
8. fail the test if children, ports, locks, or temporary files remain.

Add a startup orphan audit for prior harness run directories/PID manifests. It may clean only a
validated harness-owned directory and a still-matching recorded process command line. Containerized
CI should use a read-only source mount, writable temporary/artifact mounts, resource limits, and
automatic container removal.

The real-game tier is different: it must not stop `Fallout76`, the production overlay, Steam, ZFE,
or xScal unless the user explicitly authorized that exact test run and the runner recorded the exact
process it launched. On timeout without that authority, stop sending input, collect evidence, mark
the run blocked, and leave the user's applications untouched.

### M3 — relay and recovery laboratory

Use the local backend or deterministic relay fixture for delays, disconnect/reconnect, cursor gaps,
duplicates, retries, rate limits, limited accounts, room changes, and browser-open handoff. Provide
a live panel showing simulated calls/logs while a developer drives the HUD manually.

Exit: every scenario in `hud-recovery.md` is automated or explicitly native-only.

### M4 — optional licensed GFx host

If a licensed Scaleform SDK exists, build a Windows host that loads/advances the production SWF,
injects mock bridge functions, supplies ExternalInterface, translates Windows keydown/up and
character input into `GFx::KeyEvent`/`GFx::CharEvent`, sets the exact viewport, and captures frames.
This improves renderer fidelity but still does not certify Bethesda HUDMenu, provider hooks, fonts,
or ControlMap. Never acquire or redistribute proprietary GFx binaries without a valid license.

### M5 — bounded real-game smoke runner

Use a dedicated Windows QA machine, real installation, test account, and exactly one provider at a
time. Keep it supervised until Bethesda/provider policy and account safety are reviewed. It may
launch the already-installed game, send bounded keys to the game window, capture video/screenshots,
and tail sanitized native logs. It must not read memory, inject code, scan ports, alter gameplay
state, or kill `Fallout76` outside an explicitly owned test run.

The compact matrix is: boot, open/type/edit/submit/cancel, channels/rows, one relay message, one
link, F11 persistence, reload/unload, and provider identification. Native logs are authoritative.

## CI artifacts

After M2, add a non-game `hud-simulator` CI job. On failure upload:

- manifest with commit, source/SWF SHA-256, Ruffle version/SHA, and profile;
- sanitized `events.jsonl`;
- `sim-zfe.log` or `sim-xscal.log` headed `SIMULATED — NOT NATIVE PROVIDER OUTPUT`;
- screenshot/short recording, console trace, and failed assertions.

Use generated fixtures only—no tokens, real messages, stable account IDs, or real membership.

## Local game-file audit (read-only, 2026-09-14)

Confirmed on the mounted Steam installation:

- `Fallout76.exe`: 99,230,048 bytes; SHA-256
  `9def7201736a1d1d6c3833aebfb2d6e1ac9dfc2a6d3ac127cf8443c2d3b1d593`.
- `HUDModLoader.ba2`: BTDX v1 GNRL with exactly `interface/hudmenu.swf`,
  `interface/hudmodloader.swf`, and `interface/HUDTools.swf`.
- Extracted host artifacts validate as: HUDMenu CWS v15/3 frames; HUDModLoader CWS v17/1 frame;
  HUDTools CWS v17/1 frame. Their SHA-256 values are respectively
  `130c1e16dbfc7901adf129d3c7df7318293994a7da13095853ab0511b4364fd4`,
  `e24d707799ba1bd7c58ce2e297ebab2d8f72a19c55a74042adecdfaabf4f3843`, and
  `c0fdaa0f54f0d36c4e84516e2941cc1ead31fa2867a32d5ff18a030eb1dbb5a3`.
- `hudmodloader.ini` registers one `FCMChatWidget` child.
- The active `dxgi.dll` contains xScal/chat capability markers; `xscal.ini` enables chat and points
  at the production relay. The current xScal log identifies Fallout runtime `1.7.25.39`.
- The installed widget archive is BTDX v1 GNRL with one `interface/FCMChatWidget.swf`; that SWF is
  FWS v32 and identifies widget `2.10.85`. The workspace candidate is newer, so this installed copy
  must not be used as evidence for current-source behavior.
- The existing native ZFE log proves real SharedHUDTools editor focus, HUD named key down/up events,
  relay polling, and sliced row rendering occurred in-game. Sanitized timings above came from it.

This review supports the contract-host design and supplies real assets for the private loader-stack
spike. It does not make Ruffle equivalent to Fallout 76, and no local game file was changed.

## Production 2.10.110 verification (2026-09-16)

The complete 37-case suite and the pure Haxe/source/package/SWF/BA2/emoji checks passed for the
final production tree, followed by hosted CI. The provider-identical BA2 was then installed on the
desktop and MSI laptop. Fresh final-build ZFE 0.15.0 logs showed saved-auth and history restoration;
the desktop reached relay-confirmed Server membership without a message-triggered auth refresh.
The native xScal soak evidence belongs to 2.10.109: both machines crossed the former
queue-retirement failure boundary without resync or FCM errors, and the same logic plus compiled
xScal scenarios shipped in 2.10.110. This evidence accepts the released startup/recovery fixes but does not make the simulator
authoritative for new game builds, provider versions, real world hops, or ControlMap suppression.

## Authority matrix

| Surface | Ruffle simulator | Licensed GFx host | Real game |
| --- | --- | --- | --- |
| FCM state/relay logic | authoritative | corroborating | smoke |
| Visual layout | approximate | high fidelity | authoritative |
| SharedHUDTools | simulated | simulated | authoritative |
| Key/character sequences | deterministic | deterministic GFx | authoritative smoke |
| ControlMap suppression | unavailable | unavailable | authoritative |
| ZFE/xScal calls | contract simulation | contract simulation | authoritative |
| Provider logs | simulated labels | simulated labels | authentic |
| General CI | suitable | licensed runner only | unsuitable |

## Evidence anchors

- Autodesk Scaleform player/launcher:
  <https://help.autodesk.com/cloudhelp/ENU/Scaleform-Help/scaleform_help/getting_started/installation_usage/using_scaleform_launcher.html>
- Autodesk GFx keyboard/character events:
  <https://help.autodesk.com/cloudhelp/ENU/Scaleform-Help/scaleform_help/integration_tutorial/integration_game_engine/integration_processing.html>
- Autodesk GFx host/movie communication:
  <https://help.autodesk.com/cloudhelp/ENU/Scaleform-Help/scaleform_help/game_communication.html>
- HUDModLoader: <https://github.com/GitCrazy-wc/hudmodloader>
- xScal: <https://github.com/DCHoaxer/xScal>
- Ruffle: <https://github.com/ruffle-rs/ruffle>

## Ultrawide positioning regression

The compiled `ultrawide` scenario runs with both xScal and ZFE in the required
`hud-ruffle` suite. It exercises production menu callbacks, all compact customization
branches, repeated movement to x=-330, horizontal bounds, INI round-trip, editor
alignment and position-only recovery. Pure config/layout tests and backend
`hudLayoutService` tests cover matching relay validation and saved negative offsets.
Actual 21:9/32:9 host transforms, clipping and F11 menu placement remain native-only:
check both screen edges, open editor, resize, reload, and Reset position on each provider.
