# Overlay header controls

Desktop-only changes (September 2026):

The online total includes Discord-only activity as well as connected HUD/overlay
accounts; see [community presence](../realtime/README.md#community-online-count).

- PM uses the same split main-tab divider as channel and Party tabs.
- Hover, keyboard-focus or click **Live** for unique connected FCM-account counts.
  With a backend-confirmed bridge binding, it also shows **observed server players**.
  This includes observed game accounts, not just FCM users, but is not an
  authoritative world population. Duplicate own-name sightings count once.
- Settings → Keybinds → Live status independently enables always-visible online
  and server counts. Both default off (popover), persist in native settings, and
  mirror into the renderer without reconnecting chat. No server count appears
  without a confirmed binding. Unknown values are unavailable/“—”, never zero.
- A single down-arrow opens Refresh, Settings and Minimize. It points up while
  open. Escape/outside click closes it; arrow keys/Home/End navigate actions.
  Close and the Party member-panel button remain separate. Header controls do not
  drag the window; portals prevent main-row clipping.
  Popovers use the selected theme's background at full opacity, independent of
  the chat chrome transparency setting.

Website/dashboard and visible HUD controls are unchanged.

## Presence protocol and safety

Desktop sends authenticated `presence:stats` on its existing chat socket with
`{ requestId }` (1–64 ASCII letters/digits/hyphens). Reply has the same type and
`{ requestId, totalOnline, observedPlayers, bindingId }`; the last two fields are
null without a fresh, watched, session-authorized bridge binding.

The handler rejects browser tickets, replaced sockets and expired session keys.
It checks sessions before reading and before replying, accepts no client-provided
room authority, limits requests to four/account/30 seconds, and permits one
outstanding stats read/socket. Room/observation validity is rechecked after roster
reads. No names, exports or credentials are returned. Existing global presence
deduplicates account IDs across overlay/native transports.

The renderer requests only while stats are pinned or the popover is open, every
30 seconds while document-visible. Replies must match the current request and
binding. Account/binding/disconnection changes clear state. Timers/listeners are
removed on unmount; old backends gracefully show unavailable. The Electron
WebSocket adapter supports removable EventTarget listeners alongside `onmessage`.

**Backend deployment is required for real counts.** An overlay build alone does
not update hosted Dev. No backend deployment is included in this change.

## Verification

Dashboard tests cover parsing, actions, keyboard/Escape, scope changes, matching
replies and cleanup. Overlay tests cover listeners and preference mirrors.
Backend tests cover binding freshness, teardown, session requirements, replaced
sockets and validation. The existing CI Electron interaction gate exercises PM's
divider, mock live counts, repeated menu cycles and settings persistence alongside
the tab/draft/reconnect scenarios. Mock counts are not hosted/native acceptance.
No Haxe/HUD/bridge artifact source changed; native acceptance remains separate.

Local verification: 434 dashboard tests, 1,223 overlay tests and 61 focused backend
tests passed, plus all three TypeScript checks and the complete Electron interaction
script. The script also verifies pinned-count persistence across restart after
removing its temporary localStorage. Test-owned services/profiles are torn down.
