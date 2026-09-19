# SERVER session binding

Introduced in v2.10.58 and shipped with the current 2.10.110 HUD. The observations below are
dated; [the HUD index](../README.md) owns current build and in-game verification status.

Visible HUD widgets use this native binding directly. The separate
[background HUDModLoader bridge](../background-server-bridge.md) adds `FCMBRIDGE/1` roster
controls and a 45-second device lease to authorize private desktop Server delivery. A visible
widget's `FCMSESSION/1` binding alone does not attach the overlay. The bridge is a local 0.1.0
candidate; deployment and runtime acceptance are pending.

The desktop ZFE log for 2026-09-05 20:03–20:04 records v2.10.56 on a public world:
roster sends contained zero names, SERVER was selected with zero rows, and the widget logged
an acknowledgement before the native network request completed. This confirms native acceptance
was being mistaken for a relay binding. A regression also reproduced solo rooms retaining the
same key across LEAVE and a fresh roster, exposing old-world history after a hop.

## HUD observations

The shared xScal/ZFE widget reads only the game's exposed BSUIDataManager data. In addition
to the existing player/team/voice lists, it reads `MapMenuData.MarkerData` entries with
`markerType == "PlayerRemote"` and their `text`, and `PublicTeamsData.publicTeams[].members[]`
with `playerName`. It removes local names and title decorations and sends at most 24 names.
Non-player map markers are excluded. These interface shapes came from static interoperability
inspection; fresh logs must establish when they populate in the current game build.

`MenuStackData.menuStackA[].menuName == "MainMenu"` clears SERVER, sends LEAVE and resets
the session nonce. HUD recreation, a roster boundary, and reconnect also reset the nonce.
The widget logs provider counts and the opaque confirmed room key, never roster names.

From 2.10.101, session comparison prefers a fresh map roster, then the player list, and only
falls back to the auxiliary union when both are unavailable. Empty/disjoint nearby or team
lists no longer override an unchanged primary. A transient empty primary waits up to 60 seconds
without renewing the relay lease; repeated empty observations do not restart that grace.
Same/overlapping recovered lists retain Server history, selection, and nonce. Disjoint nonempty
primary lists still leave/rebind, and MainMenu still leaves immediately. This is a continuity
heuristic on the exposed HUD data, not a new authoritative server identifier.

Authentication readiness and roster readiness are independent gates. Native history and roster
events may arrive while the provider still reports `connecting` or lacks a stable authenticated
sender ID. The widget retains that bounded evidence but does not send `ROSTER`, expose Server, or
accept room rows until authentication is linked and the relay confirms the current request ID.
From 2.10.107, the ordinary event poll rechecks pending/missing-identity ZFE auth just as the xScal
path already did. This fixes the startup race where sending an unrelated message happened to force
the missing refresh. Once ZFE is settled, the widget stops redundant auth reads. A send is neither
required nor accepted as proof of authentication.

## Protocol

Existing `FCMCTL/1/ROSTER`, WORLD and LEAVE bodies remain compatible. A new widget may add up to
four `@self:<local-roster-name>` fields to ROSTER. These are normalized, bounded room evidence and
never replace the relay-token identity. Mutual matching may use the primary account name or a
self alias on each side, but each client must still report the other. An older relay treats the
additive fields as unmatched peer names, permitting a HUD-first rolling update. A new widget includes
`targetUserId: "FCMSESSION/1;<requestId>"` on ROSTER/WORLD controls. The request ID is bounded
to 1–64 lowercase alphanumeric/hyphen characters, identifies a HUD session, and is not an
authentication credential. The existing relay token remains the actor identity.

The relay stores the request ID with the roster. New/missing rosters or a changed request ID
receive a fresh server-generated session UUID; keepalives retain it. A connected component's
room uses the root member's session UUID rather than their permanent user ID. Legacy roster
entries lacking session metadata are replaced on their next heartbeat. Store failures propagate
instead of returning a successful membership acknowledgement.

After storing and rebinding membership, the relay sends a normal system `chat.message`:

```text
channel: system
senderUserId: system
body: FCMCTL/1/SERVER-READY:<requestId>|<roomKey>
```

This confirmation precedes the room's replay rows, including for an empty room. Rebind pub/sub
includes the request ID and source instance; other instances deliver the confirmation/replay to
their local subscribers. Local loopback is ignored. The widget intercepts this system control
before link-notice rendering and accepts only its current request ID. Native RPC acceptance is
logged as acceptance, never as proof of delivery. Pending binds retry every 10 seconds; confirmed
sessions refresh every 30 seconds and lose readiness after 60 seconds without confirmation.

Saved provider credentials belong to ZFE/xScal, not the BA2. On a normal game launch the provider
restores its token, the widget obtains authenticated identity through `getAuthState`, drains history,
submits the current roster, and waits for matching `SERVER-READY`. If any stage is pending, Server
stays hidden while static channels may still render. A completed web link or recovered sign-in
notice re-arms history and roster recovery; it does not bypass confirmation.

The widget holds up to 64 early server rows until confirmation, then validates them before
rendering. This preserves live rows that arrive during the history read. It requires canonical message IDs prefixed
with `server:<confirmedRoomKey>:`. An outgoing SERVER message carries
`targetUserId: "FCMROOM/1;<confirmedRoomKey>"`; the relay rejects it if current membership differs.
These fields are control metadata, not whisper recipients. Legacy clients without these fields
retain their original protocol behavior.

## Limits and validation

This is **roster-derived grouping, not an authoritative Fallout server ID**. The inspected HUD
account data has no unique world ID. Mutual sightings are required to join two FCM users;
missing or unpopulated rosters can therefore leave same-world users in separate solo rooms.
Roster-visible self aliases reduce false separation when `AccountInfoData` and peer-visible names
differ, but they remain untrusted evidence and confer no account authority.
Stale UI data remains a runtime concern. A solo room means no confirmed matching FCM user,
not an empty Fallout world. Cluster membership changes can change the ephemeral room key;
history continuity is not guaranteed after the last FCM participant leaves.

Automated tests cover both adapters, map/team shapes, delayed provider authentication, main-menu detection, delayed confirmation
rejection, expiry, old-room row/send rejection, empty-room confirmation, replay order, solo hops,
storage failures and mutual-sighting isolation. The delayed-auth scenario begins with history and
roster evidence already present, advances normal timers, and requires authentication, one roster
control, relay confirmation, and a visible Server tab without a user send. These checks run in the
Haxe/Ruffle and backend CI jobs; native logs remain required for the extender/GFx boundary.

For live acceptance, test two linked FCM users on the same public world, first before and then
after opening the map. Check that both report nonzero roster names and the same confirmed room,
then exchange SERVER messages. Fast-travel within the same world and verify no LEAVE, tab reset,
or lost rows. Then move one user to another world twice: room keys must separate,
old rows must disappear, and neither user may receive the other's new SERVER messages. Repeat
with each extender. General/Trading/Events/Infests/Raids should retain static history throughout.
Use a matching backend that emits session confirmations; a build with only RPC acceptance
cannot confirm the modern SERVER tab. Verify the actual target deployment before testing.
