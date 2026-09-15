# FCM in-game HUD: ZFE and xScal

This is the maintained entry point for the optional in-game HUD mod. It is separate from the
default desktop overlay. The overlay does not install game files or require an extender. The
HUD mod uses UI assets and already-exposed HUD data through an extender's sanctioned API; it
must not add game-memory reads, code injection, or network/port scanning.

## Current implementation and verification

As of **2026-09-12**, the local source and rebuilt SWF/BA2 are **FCMChatWidget 2.10.78**.
This is a review candidate, not a publication or installed-game claim. Local Haxe, relay,
source-anchor, packaging, and SWF/BA2 checks passed during the review; hosted CI and in-game
acceptance of this candidate have not been run. The last recorded desktop ZFE confirmation
covers 2.10.74 name colors and emoji, not every later change or every provider. See
[styling test history](../../testing/hud-emoji-status.md) and
[recovery acceptance](../../testing/hud-recovery.md).

| Need | Maintained reference |
| --- | --- |
| Build, install, package, and validate | [Widget build guide](../../../game-mods/FCMBridge/hudmodloader-chat/BUILD.md) |
| Widget source and behavior | [Widget README](../../../game-mods/FCMBridge/hudmodloader-chat/README.md) |
| Native relay, authentication, controls, cosmetics | [FCM integration](native-chat-relay/fcm-integration.md) |
| Extender API distinctions and current author links | [Provider API guide](modder-guide.md) |
| Appearance, fonts, emoji, persistence | [Appearance](ingame-chat-appearance.md) |
| Open key, channel navigation, scrolling | [Packaged keybind guide](../../../game-mods/FCMBridge/hudmodloader-chat/KEYBINDS.txt) |
| Rendering, input ownership, artifact constraints | [Scaleform engineering guide](scaleform-ui-guide.md) |
| Owned files and install conflicts | [Surface manifest](hud-surface-manifest.md), [compatibility](hud-mod-compatibility.md) |
| Duplicate/reconnect/send behavior | [Recovery checks](../../testing/hud-recovery.md), [retry receipts](hud-send-retries.md) |
| Background HUDModLoader mod for desktop Server chat | [Background bridge implementation and acceptance](background-server-bridge.md) |

The separate [FCMServerBridge 0.1.0 background candidate](background-server-bridge.md) uses
HUDModLoader and the same native provider adapter. It has no chat widget: status/linking live
in the loader menu and chat appears in the desktop overlay through a private account/room
lease. Backend and renderer changes are local; hosted deployment and in-game acceptance are
pending. The visible widget's room alone does not enable desktop Server chat.

## Native transport and provider selection

`FCMChatWidget.ba2` contains only `interface/FCMChatWidget.swf`. HUDModLoader loads this child
widget; FCM does not patch HUDModLoader's HUDMenu for this package. The widget calls
`FcmNativeApi`, which selects already-exposed xScal `chatInterface` first, or a validated ZFE
dispatcher. Both use `wss://<target>/relay`. The native extender owns credentials and network
transport; a call-only `__SFCodeObj` is not sufficient provider identification.

ZFE receives command names and JSON strings. xScal chat methods receive ActionScript objects,
with no arguments for designated state/runtime/reset operations. Its optional generic callback
is used separately for logging and numeric `Input.*` key calls. Required chat methods gate xScal;
when its optional runtime-info method exists, its response must also pass validation.

Unlinked users receive a pinned link notice and cannot send. Linking is completed at the target
website's `/link` page. Connection success alone does not establish a linked account. SERVER
membership uses authenticated controls built from HUD-published account/world/roster data.
See the [native relay guide](native-chat-relay/README.md) for the full data path.

### Current game font aliases (2.10.97)

FCMChatWidget body text, prompt text, status text, and punctuation use `$MAIN_Font`; tab labels
and sender names use `$MAIN_Font_Bold`. This is based on the active Fallout 76 English
`interface/fontconfig_en.txt`, which maps those two aliases to Roboto Condensed faces. It does
not map `$MAIN_Font_Light`. Using that nonexistent alias renders the body range as square
placeholder glyphs, which can make the `Name: message` separator appear missing even though the
serialized message includes it. The Ruffle harness uses the corresponding direct face names,
`Roboto Condensed` and `Roboto Condensed Bold`.

### ZFE automatic roster safety (2.10.92)

The visible widget fails closed on automatic Server-room roster/leave controls through ZFE. ZFE
older ZFE builds perform that relay operation synchronously on Fallout's Scaleform/UI thread; an
unreachable relay was observed blocking the thread for roughly 15 seconds per attempt. Static
community chat/history remains enabled. xScal retains Server-room binding.
Restore ZFE automatic binding only after its provider exposes and tests a non-blocking request
primitive; scheduling the native call from an SWF timer does not make it asynchronous.

From widget 2.10.94, ordinary ZFE sends require the runtime capability
`zfe-chat-async-send-v1`. A ZFE build without it gets an update-required message instead of a
potentially blocking native call. The gate uses the advertised capability, not a version string.

## Combined General feed

In local candidate 2.10.78, General shows **General, current-room Server, Trading, Events,
Infests, and Raids**. The six allowed slugs are `global`, `server`, `trade`, `events`, `infests`,
and `raids`. Tabs filter one retained record list; each row keeps its source channel and message
identity. Sending from General still sends to `global`. No message is copied or rebroadcast.
Private, system, and unknown channels do not enter the combined view. SERVER rows require a
confirmed current room and are removed on leaving it; static-channel history remains.

Replay rejection precedes pending-send reconciliation. A retained canonical row rejects the
same channel/message ID even after bounded-cache eviction. Different nonempty ACK/event IDs
cannot match by body or sender fallback. Legacy matching is bounded and unique-only, so an
intentional repeated send is not silently merged. Provider event IDs cover older events without
a durable message ID. These guards do not merge distinct server-assigned messages or suppress
a second independently loaded renderer.

Initial history is bounded to 15 rows per static channel plus 50 for the current SERVER room,
then one terminal completion frame, drained in 16-event native polls. Authenticated recovery and
world rebinding preserve that partition. New-message notices count only rows visible in the
selected tab. Delayed render slices have generation checks and their own exception handling;
stale work cannot replace a newer feed with a fallback.

## Input and appearance

The shipped key map is `openKey=INSERT`, `channelNextKey=NextPage`, `channelPrevKey=PrevPage`,
`scrollUpKey=Up`, `scrollDownKey=Down`, `scrollBottomKey=`, `activateLinkKey=ENTER`, and
`hideKey=DELETE`. Insert opens chat by
default; Enter sends a non-empty draft and Escape cancels. Page Up/Down switch channels while idle
or typing. Up/Down selects a message row and paints a bounded highlight. The configured link key
(Enter by default) activates the selected row's first validated HTTP(S) URL. Ruffle verifies the
selection and activation path, but Fallout's GFx host did not open the operating-system browser
through `getURL` during in-game acceptance. Shipping browser launch therefore requires a future,
sanctioned native ZFE/xScal URL-opening capability; it must not be routed through the Electron
overlay or a synchronous relay call. The HUD abbreviates
URLs to `host/...` but retains the full target; Discord channel entities and scheduled events carry
their native URLs in the existing capability-gated HUD transport. The SWF gains no independent
network transport; browser navigation is confined to already validated HTTP(S) targets.
Ordinary HTTP(S) URLs embedded in message text follow the same behavior, including messages that
also contain bundled emoji; when several links exist, the action opens the first one. Link
activation is accepted only while `openKey` owns a visible editor and a link row is selected;
before OpenChat, the same physical key remains a normal Fallout control.
The highlight color is independently configurable as `Selected message` in F11 → Customize →
Colors or as `selectedRowColor` in `FCMChat.ini`; it persists through ZFE storage and the xScal
device-scoped layout relay.
Configured feed scrolling acts only while chat owns a visible input session. The blank newest and
newest value is intentional: Home/End remain unassigned. Delete hides only while idle; `/hide` plus
F11 → FCM → Hide chat remain available. F11 → FCM → Scroll to newest is always available.
Aliases and reversed Up/Down bindings use the same navigation policy. Edge guards key on
normalized action names; different aliases are not universally one shared latch. Test simultaneous
named/physical delivery on the installed loader before claiming one action per physical press.

`Data/FCMChat.ini` is authoritative for FCM's `openKey`. After discovery the widget updates ZFE's
process-level chat watcher to that value, so an older persisted F11 snapshot or a packaged
`OpenChatKey=INSERT` cannot silently restore Insert. xScal also reads `openKey` only from that file;
xScal has no `OpenChatKey` setting. Its physical
key API takes numeric VK codes and returns Booleans. Registration does not promise keyboard
suppression. FCM's ZFE `Input.*` route remains a tested compatibility path on specific builds,
not the public `zfe-input-v1` contract. That capability names owner-scoped `input.v1.*` text
sessions. The public [hotkey contract](https://www.nexusmods.com/fallout76/articles/270) is now
available; migration to `hotkeys.v1.*` is not implemented in 2.10.85 and needs separate tests.

| Provider | Authoritative open key | Detection | Configuration precedence |
| --- | --- | --- | --- |
| ZFE | `FCMChat.ini` `openKey`, synchronized to ZFE after discovery | ZFE `isChatKeyPressed` | File key wins over persisted appearance and the packaged ZFE default |
| xScal | `FCMChat.ini` `openKey` only | Numeric `Input.RegisterKey` / `Input.IsKeyPressed` | `xscal.ini` has transport settings only and must not contain `OpenChatKey` |

| Behavior | ZFE | xScal |
| --- | --- | --- |
| Shared package | One provider-neutral `FCMChatWidget.ba2` | Same BA2 |
| Provider selection | Validated only when no supported xScal chat surface is active | Preferred when its required `chatInterface` methods validate |
| Primary visible editor | SharedHUDTools `TextEdit` | SharedHUDTools `TextEdit` |
| Native editor fallback | Legacy ZFE buffer only after SharedHUDTools fails to open | Never receives ZFE-only input calls |
| Multi-character typing | Focused public field has selection/caret enabled | Same shared field rule |
| Missing submit callback | Enter draft recovered once after 225 ms; other focus loss cancels | Same shared recovery rule |
| Delete while typing | Deletes characters; an optional Delete hide binding is suspended | Same shared priority rule |
| Default open key | `OpenChatKey=INSERT`, matching `openKey=INSERT` | `openKey=INSERT` only |
| Channel / feed keys | Page Up/Down; Arrow Up/Down after input opens | Same behavior through named actions and numeric physical polling |
| Feed refresh | Atomic hidden staging, six rows per timer turn | Same renderer; verified locally without recurring over-30 ms message turns |
| Transport payload | Command plus JSON string | ActionScript object or no arguments according to method |
| Settings persistence | ZFE vendor-scoped storage | Relay persistence only when the capability is advertised |

Provider-level physical registrations are derived exclusively from the active profile. On reload
or profile reapplication, the widget unregisters the complete previous set before registering the
new channel, scroll, link, hide, and open-chat keys. ZFE also attempts to replace its narrower native
open-chat watcher through `updateChatHotkey`, while generic `Input.*` handles physical tokens such as
F-keys that the native watcher rejects. Thus a
superseded default such as Insert or Page Down is neither dispatched nor retained as an active FCM
binding after a successful rebind.

### Verified ZFE rebind procedure

In-game acceptance on 2026-09-15 with ZFE 0.12.26 and FCMChatWidget 2.10.96 confirmed the
provider-neutral physical-key path. Exit Fallout 76, edit the existing `[FCMChat]` keys in
`Data/FCMChat.ini`, and keep the ZFE fragment `OpenChatKey` aligned with `openKey`. Restart the game;
the widget first attempts ZFE's native `updateChatHotkey`, then registers every mapped profile key,
including `openKey`, through the compatibility `Input.*` surface. A native update returning `false`
for an F-key is expected and is not fatal when physical registration succeeds. Verify `zfe.log`
contains `FCMChatWidget 2.10.96 loaded`, one accepted registration for each expected Windows VK,
and a `physical navigation poll started provider=zfe` line listing only the new profile. Exercise
every action and confirm the superseded bindings are inactive. The accepted profile was F12 open,
F8/F7 channels, F6/F5 scroll, F4 newest, F3 selected-link activation, and F2 hide.

Do not validate rebinds by editing persisted appearance storage alone, and do not infer success
from `updateChatHotkey` alone. `Data/FCMChat.ini` is authoritative; replacing the BA2 or fragment
requires a full game restart.

That 0.12.26 result remains historical in-game evidence. Nexus ZFE 0.15.0 targets Steam and
Xbox/Game Pass runtime 1.7.26.10. Static artifact inspection on 2026-09-15 confirmed that it retains
FCM's `__ZFE` dispatcher, `zfe-chat-online-v1`, `zfe-chat-async-send-v1`,
`zfe-chat-async-control-v1`, storage, input, hotkey, and physical `Input.*` contracts. The Ruffle
provider mock now identifies as 0.15.0. Fresh in-game acceptance is still required before treating
that static and simulated result as native acceptance.

### Verified xScal rebind procedure

In-game acceptance on 2026-09-15 with the installed xScal 0.1.15 contract and FCMChatWidget
2.10.96 confirmed the same physical-key lifecycle. Exit Fallout 76, select the xScal extender,
set `[Chat] enabled=true` and the intended `relayEndpoint` in the root `xscal.ini`, and edit only
the existing `[FCMChat]` bindings in `Data/FCMChat.ini`. xScal has no `OpenChatKey` setting; do not
copy ZFE's `[TextChat]` keys into `xscal.ini`. Restart the game and verify `xscal.log` contains the
2.10.96 startup marker, `provider=xscal`, one accepted `Input.RegisterKey` result per new VK, and a
physical-poll line whose `openKey` and key set match the complete replacement profile.

The accepted rotated profile was F2 open, F3/F4 channels, F5/F6 scroll, F7 newest, F8 selected-link
activation, and F12 hide. The log confirmed accepted VKs 113 through 119 plus 123, then delivered
Dev history across 16/16/10-event polls and emitted `replay completed` with 41 retained records.
Manual in-game testing confirmed the rotated actions worked. As with ZFE, exercise every action
and verify superseded bindings are inactive; registration itself does not suppress an overlapping
Fallout gameplay action.

That 0.1.15 result remains historical in-game evidence. Nexus xScal 0.2.16 targets Fallout runtime
1.7.26.10. Static artifact inspection on 2026-09-15 confirmed that it retains FCM's required
`XSCALCHATV1`/`chatInterface` methods and `Input.RegisterKey`, `Input.IsKeyPressed`,
`Input.UnregisterKey`, and `Input.ClearKeys` callbacks. The Ruffle contract fixture and suite now
exercise 0.2.16. Fresh 1.7.26.10 in-game acceptance is still required before promoting that static
and simulated compatibility result to native acceptance.

Channel and scroll bindings always come from `FCMChat.ini`. Both providers use the visible
SharedHUDTools editor; only ZFE can use the native draft buffer as a fallback. Provider acceptance
must verify Insert opens one visible editor, `hello` remains five characters, Page Up/Down switch
channels only during the owned edit, Escape cancels, and Enter submits once. If the host editor
loses focus without its callback, the widget waits 225 ms, recovers an Enter submission once, or
cancels other stale sessions so Insert works again. The recovery draft stays in memory and logs
only its length. Do not infer xScal
key support from ZFE commands or route ZFE input verbs through xScal's `chatInterface`.

Provider hotkeys remain observable globally, but FCM will not acquire the editor in a configured
`hideInHUDModes` state. The default includes `ContainerMode`; this prevents a letter binding such
as T from stealing Fallout's Deposit All action. A held key is latched while blocked, so leaving
the container does not open chat until a fresh key press. Letter bindings can still overlap
ordinary gameplay controls outside blocked modes and should be chosen accordingly.

Both providers use the host's SharedHUDTools editor first. The widget does not dispatch its own
ControlMap lock events. A legacy ZFE editor fallback has different ownership guarantees and must
not be described as the public owner-scoped text-session API.

F11 → FCM → Customize controls panel/input dimensions, text sizes, backgrounds, text colors,
opacity, position, and auto-hide. Input width/alignment follow the panel. Channel tags/colors,
badges, emoji, and available/default channels are fixed; timestamps are not displayed.
The [appearance guide](ingame-chat-appearance.md) lists active and retired settings.

## Configuration and packaging

Use `package.py` with an explicit `--target dev|prod`, `--provider unified|zfe|xscal`, and
`--distribution website|nexus`. Target stamps set both relay endpoint and web link destination.
A generated filename is not proof of which endpoint the game loaded.

The modern ZFE fragment is `Data/ZFE/TextChat/fragments/FCMChatWidget.ini`; `FCM.ini` belongs to
the legacy standalone build. A global `Data/configuration/zfe.ini` `[TextChat]` override wins over
the fragment. xScal uses `[Chat] enabled=true` and `relayEndpoint` in `xscal.ini` beside the game
executable. Merge existing sections, loader registrations, and archive lists; never replace
unrelated settings. Install only the selected provider's configuration and restart the game
after changing a BA2 or native extender configuration.

Packages do not redistribute extenders or Bethesda HUDMenu assets. Website ZIPs may include
optional Windows xScal setup helpers; Nexus ZIPs omit executable/script files; xScal/unified variants include a
helper-download note. All builds include manual setup, keybind, customization, and emoji-license
files. See the [build guide](../../../game-mods/FCMBridge/hudmodloader-chat/BUILD.md).

## Client version handshake (`clientVersion`)

The widget identifies itself as `chatv1-widget-v<VERSION>` to the native relay. Backend feature
negotiation uses that identity and permission flags; a numerically newer extender is not proof
that an optional API exists. Verify the actual startup build, provider, auth, endpoint, and
capabilities. HUD feature negotiation is separate from the desktop overlay QA-build lock.

## Diagnostics

Current source emits build/instance, provider, receive/echo counts, render row/layout/name-color
counts, and bounded error context. Check actual log statements before documenting additional
fields: the `FcmDiagnostics` helper/tests do not establish that every planned summary is wired
into the renderer. Repeated content alone is not evidence of duplicate delivery. Keep diagnostics
free of raw tokens, chat bodies, player names, and stable account IDs.

## Historical material

The generic remote-data feed and TCP/WebSocket HUD bridge are retired implementation references,
not installation instructions for FCMChatWidget. Their legacy line protocol named `FCMHUD/1` is
separate from the **active** `FCMHUD/1;...` metadata envelope in native-chat `targetUserId`.

- [Remote-data pattern](fcmbridge-data-pattern.md), [socket transport](realtime-socket.md),
  [two-way socket patch](two-way-chat-implemented.md), [old Proton proxy](linux-proton-relay-proxy.md).
- [Native protocol snapshot](native-chat-relay/protocol-spec.md) and
  [older send investigation](ingame-send-investigation-2026-08-06.md).
- [Widget build history](../../../game-mods/FCMBridge/hudmodloader-chat/BUILD-HISTORY.md).

Keep dated observations as history. New behavior belongs in the maintained guides and must
state separately what is in source, built locally, tested in-game, installed, and published.
