# FCMChatWidget

FCMChatWidget is the optional HUDModLoader chat widget for Fallout 76. It uses ZFE or xScal's
native chat bridge and FCM's `/relay`. It is independent of the desktop overlay.

**Local candidate: 2.10.85 (2026-09-13).** The feed builds delayed row batches in a hidden
snapshot and swaps them into view only after positioning is complete, preventing the overlapping
intermediate frame seen as a white flash. Windows 10 xScal measurements showed that the former
32-row work slices still occupied 32-65 ms of a frame, so rebuilds now process six rows per timer
turn while the last complete snapshot remains visible. The xScal/SharedHUDTools input path also records
privacy-safe editor metadata (length, caret, selection, focus, and maximum length) while an edit is
open. The single BA2 uses the visible SharedHUDTools editor with both providers and enables its
public TextField selection/caret behavior. It retains the active draft only in memory: if Enter
removes the host field but HUDModLoader fails to deliver its submit callback, a short watchdog
submits that draft once and releases the editor state; other sustained focus loss cancels and
re-arms Insert. Draft content is never logged. Provider detection keeps
ZFE native input as a fallback and prevents xScal from receiving ZFE-only calls. Source validation is complete;
fresh 2.10.85 in-game validation on both providers is still required. The preceding 2.10.84
production-target BA2 was validated locally with xScal for visible multi-character editing and
frame-budgeted message refresh; 2.10.85 is installed with xScal for final Delete-key acceptance.
This is not a claim of publication or hosted CI success.
See [BUILD.md](BUILD.md) for reproducible checks and installation, and the
[HUD documentation index](../../../docs/overlay/zfe/README.md) for owning guides.

## Feed and sends

General combines General, current-room Server, Trading, Events, Infests, and Raids. Each message
retains its original channel tag and canonical identity. Other tabs filter the same bounded
history. Sending from General targets `global`; no messages are copied or rebroadcast. Unknown,
private, and system channels are excluded. Leaving a room clears its SERVER records and
identities without clearing static history.

Replay rejection runs before pending-send matching. Retained canonical rows remain a duplicate
guard after cache eviction. A known ACK ID cannot match a different event through a same-body
fallback. Missing-ID compatibility matching is bounded and unique-only; ambiguous repeated sends
are not guessed together. Read-back mode preserves scroll position and counts new visible rows.

A pending own row is painted before a deferred native send call. Authoritative ACK/event data
reconciles that row once, including server-provided cosmetics. With negotiated retry support,
transient failures keep a bounded queued row; terminal failures remove it. The same local request
ID is reused for retries, with SERVER room pinning. See
[retry safety](../../../docs/overlay/zfe/hud-send-retries.md).

Initial history contains up to 15 messages per static channel and 50 from the current SERVER
room. The widget drains the up-to-125-event snapshot over multiple native polls. Empty/lost
queues trigger bounded authenticated recovery; SERVER history waits for a fresh room bind.
Account identity comes from the public HUD account handle, not a local character label or the
`Wanderer` placeholder. Limited identities see a pinned link code and cannot send.

## Provider and input contracts

`../FcmNativeApi.hx` discovers already-exposed objects, preferring a validated xScal
`chatInterface` when both providers are present. ZFE requires a positive chat capability response.
xScal requires chat methods and checks its optional runtime response when present. ZFE gets JSON
strings; xScal gets ActionScript objects or no arguments according to the selected method. Its
generic callback is separate from chat transport.

SharedHUDTools owns the main text editor and balances its game-control lock. A legacy ZFE input
fallback is retained; the widget does not dispatch ControlMap lock events itself. The public ZFE
`input.v1.*` text-session and `hotkeys.v1.*` APIs are different contracts and are not implemented
by renaming FCM's compatibility calls. See the [provider guide](../../../docs/overlay/zfe/modder-guide.md).

The shipped key map is `openKey=INSERT`, `channelNextKey=NextPage`, `channelPrevKey=PrevPage`,
`scrollUpKey=Up`, `scrollDownKey=Down`, `scrollBottomKey=` and `hideKey=DELETE`. Insert opens chat;
Enter sends; Escape cancels. A missing host callback cannot leave Insert permanently latched.
Page Up/Down switch channels while idle or editing. Up/Down scroll
only while chat owns the visible editor. The blank newest value leaves Home/End as game controls.
Delete hides while idle, while `/hide` and the F11 menu also hide the feed. `KEYBINDS.txt` covers aliases,
rebinding, physical polling, and ZFE config precedence.
The default `hideKey=DELETE` hides only while input is idle. While either
provider owns an editor, Delete remains a text-edit key and cannot close or hide the widget.
xScal's numeric `Input.*` operations require Boolean results; ZFE's compatibility decoder also
handles its legacy envelopes. Registration does not promise gameplay suppression.

Slash shortcuts include `/g`, `/t`, `/e`, `/i`, `/r`, and `/s`; `/clear` clears the local feed,
`/hide` hides it, and `/relink` requests the provider's supported credential reset. Reset failure
must not claim a new identity. `/emoji` searches/sends bundled emoji. Staff-only `/mod` commands
resolve visible targets to immutable IDs and repeat permission checks on the backend. See
[staff commands](BUILD.md#staff-moderation-commands).

## Rendering and customization

Each row has a full-width native multiline plain-text field with `TextFormat` ranges for channel,
name, body, and staff reference. A supporter star and bundled emoji sprites share the row's
coordinate basis. Placement measures layout bounds and reserved slots after wrapping; it does
not require global transforms when the fields and decorations already share a parent.

The styled baseline survives optional emoji failures. Known Unicode/custom emoji use bundled
static vector sprites; unsupported custom emoji fall back to readable names. No remote emoji
images or GIF playback are loaded. Delayed row slices check their generation and catch their own
failures; fallback invalidates pending work. Flash/JavaScript tests do not establish GFx behavior.

Burst traffic (poll batches, optimistic echo, ACK reconciliation) coalesces into one deferred
render per tick; tab switches, resizes, and config changes still render immediately. Tail
appends reuse the committed snapshot's matching prefix rows and only construct the new suffix.
Rows take a single build pass (plain bodies skip the emoji planner via a fast prefilter),
`TextFormat` objects and font measurements are cached per font size, staging layers and the
slice timer are reused, and the slice size adapts within 4-12 rows to hold the per-tick UI
budget. Pure planning helpers live in `FcmFeedPlan.hx`/`FcmRenderCoalescer.hx` with
`test-feed-plan.hxml` coverage.

F11 → FCM → Customize changes position, independent panel dimensions, feed/input text size, input
height, backgrounds, text colors, opacity, and auto-hide. Input width/alignment follow the panel.
Server-resolved user colors override the default local sender color. Timestamps are not shown;
channel colors/tags, badges, emoji, and available/default channels are not appearance controls.
See [CUSTOMIZATION.txt](CUSTOMIZATION.txt) for active/retired INI keys and saved-setting precedence.

ZFE stores F11 settings in vendor-scoped storage. xScal uses per-linked-device relay persistence
only when the backend advertises the capability and supports the settings payload. Missing
persistence leaves changes session-local. A code checkout does not establish backend deployment.

## Files

| File(s) | Purpose |
| --- | --- |
| `FCMChatWidget.hx` | Widget lifecycle, input, native relay integration, rendering |
| `FcmCommand.hx`, `FcmHistory.hx`, `FcmEcho.hx`, `FcmOutbox.hx` | Channel/command, replay, echo, retry guards |
| `FcmConfig.hx`, `FcmHudLayout.hx` | INI settings and optional per-device persistence |
| `FcmRenderGeneration.hx`, `FcmFeedText.hx`, `FcmEmoji*.hx` | Delayed rendering, styled text, bundled emoji |
| `FcmFeedPlan.hx`, `FcmRenderCoalescer.hx`, `TestFcmFeedPlan.hx` | Pure render planning (coalescing, prefix reuse, slice budget) + tests |
| `FCMChat.ini`, `FCMChatWidget.ini`, `hudmodloader.ini` | Package configuration templates and loader line |
| `build.hxml`, `normalize_swf.py`, `emoji/` | Haxe build, FWS normalization, bundled sprite data/licenses |
| `package.py`, `test_package.py`, `test-*.hxml` | Target/provider/distribution packaging and checks |
| `FCMChatWidget.swf`, `FCMChatWidget.ba2` | Generated local artifacts; verify decoded payload equality |
| `BUILD-HISTORY.md` | Dated investigations and superseded build notes |
