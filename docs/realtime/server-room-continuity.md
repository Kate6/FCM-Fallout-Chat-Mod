# Server room continuity

The shared native HUD/desktop bridge coordinator retains server-generated room
affinity on each live roster session. Peer departure no longer changes the
survivor's canonical room/history key simply because the departed peer was the
union-find root. A new mutual member can join an existing room without renaming it.

Affinity is internal Redis metadata, never supplied by clients. Ordinary roster
refreshes preserve it for the same request/session generation. HUDMenu is also
reconstructed by normal game transitions such as raid-stage and score-screen
completion. A replacement starts with a new delivery request nonce and can publish
an empty MapMenuData snapshot before the game's UI data sources recover.

For the native HUD path only, a changed nonce plus an empty roster no longer replaces
a fresh nonempty roster. The relay leaves the prior mutual-sighting evidence and its
original Redis TTL untouched and deliberately withholds `SERVER-READY`; therefore a
permanently blank or dead client cannot renew stale membership. The widget's normal
retry supplies a later roster. If that nonempty roster overlaps the prior roster, the
existing same-world heuristic keeps the backend session, room affinity and age while
adopting the new delivery nonce. A disjoint nonempty roster remains a new world
generation. This works whether or not the separate history-recovery `FCMCTL/1/RESYNC`
was necessary.

An explicit leave, expired/missing roster, disjoint replacement, or desktop export
world-generation change still discards affinity. RESYNC cannot recreate a cleared or
expired roster and never extends observation freshness. Coordination writes use XX
and KEEPTTL for the same reason. No HUD, bridge, overlay protocol, or client binary
changes are required.

If surviving members of an old room split into disconnected components, none of
those components inherits that shared room. They receive independent rooms until
mutual sightings justify convergence. This deliberately favors isolation over
history continuity when world evidence is ambiguous. Roster inference remains
non-authoritative; there is no trusted game-world ID.

### Roster-visible self names

HUD and account APIs can expose different labels for the same player. A 2.10.111 HUD therefore
adds bounded `@self:` aliases to the existing printable v1 roster control, and bridge 0.2.4 prefers
the local name from its fresh selected roster source for exported `ownName`. The coordinator may
match any normalized primary/alias name, but still requires both clients to report each other.
Aliases affect grouping only; relay tokens remain the sole actor identity and all sender/account
attribution is unchanged. One-sided aliases remain isolated, malformed or excess aliases fail
closed, and freshness/session/generation rules apply to the whole roster record.

The additive v1 encoding supports a HUD-first rolling update: an older backend treats `@self:` as
an unmatched peer entry rather than chat. A backend-first update accepts old clients with no
aliases. Automated coverage includes differing account labels, mixed HUD/bridge transport labels
and one-sided rejection. Fresh two-client native acceptance remains required.

### Delayed peer departure

A remaining player may report a roster without their peer before the peer's
leave reaches the backend. This still separates live rooms immediately. When
every member of a resulting component has the same previous room affinity and
unchanged observation session, the coordinator seeds its new room with a snapshot
of that old room's retained history before publishing the new assignment.
Redis COPY preserves message IDs and the existing expiration, does not replace
an existing destination, and emits no live messages. Subsequent messages remain
isolated. The list is already capped at 50 messages; no extra polling or timers
are added. Redis 6.2+ is required for COPY.
The history reader marks rows with an in-process Symbol identifying the room
actually read. Only this provenance permits an inherited message ID in desktop
history; JSON fields cannot forge it and live delivery retains strict room-ID
checks. Block filtering, binding revalidation and message-ID deduplication remain.

Mixed-affinity components, new members and new generations do not receive this
carryover. Copy failures abort assignment; missing/expired source history remains
empty. This preserves previously authorized history, not proof that clients are
still in the same world. Room IDs may change during ambiguous splits. It cannot
recover history already stranded before this fix. Native acceptance of the
delayed-departure path remains pending; automated backend tests are not proof of
the exact ordering observed on a user's machine.

Messages remain under the same capped, one-hour-idle Redis history policy. This
does not promise unlimited retention or reconstruct history already stranded by
an earlier room reassignment. Clients and their authentication protocols do not
change. Older backend instances must be drained before relying on continuity,
since they do not maintain the new optional room metadata.

Regression coverage: `worldRoomContinuity.test.js` covers either peer departing,
component splits, generation/leave boundaries, a single HUD replacement, five
simultaneous startup-empty replacements and disjoint replacement; `relayHandler.test.js`
covers withheld confirmation during recovery, overlapping replacement bind, the
authenticated RESYNC marker and history confirmation.
`localExportBridge.test.js`
covers all four mixed provider pairings, canonical publication/history and peer
departure. Delayed-departure tests cover all four mixed labels (native providers
share the same backend protocol), bridge↔bridge and HUD↔HUD, preservation of IDs
and expiry, desktop replay, future-message isolation and generation boundaries.
`bridgeConnection.test.js` rejects forged replay provenance and cross-room live
messages. Existing backend CI runs these Jest suites without a new workflow.
Native two-client acceptance remains pending deployment/manual testing.

### Rejoin room selection

Previously, mutual discovery selected the lexicographically first eligible room
UUID. A returning player's provisional empty room could therefore replace the
continuously occupied room and make both feeds appear empty, even though the old
Redis history still existed.

Roster records now carry a backend-owned `sessionStartedAt`. Observations within
the same request/generation retain it; leave, expiry or a new generation starts
a new age. Eligible rooms are ranked by their oldest still-active member session,
then UUID for deterministic equal-age ties. Split-room exclusion still runs first.
No history is unioned/copied on a join, and no history TTL is extended. The returner
receives the selected occupied room's ordinary authorized replay; history from its
provisional room is not imported. Neither client protocol nor authentication changes.

During rollout, an active legacy roster without this field ranks as age zero
(older than new sessions), preserved on subsequent observations. Malformed ages
are rejected. No migration or client reinstall is required; existing active rooms
cannot recover an already-displaced selection merely from this deployment.

This remains roster-based inference, not an authoritative world identity. If two
long-lived disconnected components discover each other, the oldest active session
chooses the canonical room; we cannot prove which component represents the physical
world. Equal-age legacy rooms retain the deterministic UUID tie-breaker. We do not
merge their histories to hide this ambiguity. Freshness, mutual sightings and
per-session authorization remain required.

Regression coverage includes both UUID orders, legacy records, age validation,
generation reset, deterministic ties, and three leave/rejoin cycles for all four
HUD/provider-to-bridge/provider pairings plus HUD-to-HUD and bridge-to-bridge.
The shared backend tests assert stable survivor room/history and TTL, isolated
provisional messages, delayed mutual discovery, rendered desktop replay and unique
message IDs from both senders. Native provider labels exercise the common native
coordinator contract here, not separate extender binaries. Existing native/Ruffle
acceptance still applies; a fresh two-client game test is required after deployment.

### HUD MovieRoot replacement continuity (2026-09-19)

A local xScal session attached a second `MovieRoot` at 00:02:19 elapsed and the new
widget immediately sent `names=0` under a new request nonce. During the later room
incident the same widget instance remained alive, the Fallout process did not exit,
and its populated local roster remained stable while three relay confirmations moved
it through different rooms in about 0.62 seconds. This confirms that another member's
topology update can repartition the entire component; it does not establish a
physical Fallout world hop.

This lifecycle is consistent with current HUD mod behavior documented by other
maintainers: the [BuffsMeter author notes](https://www.nexusmods.com/fallout76/mods/2821)
that HUDMenu resets at each raid-stage completion, while the
[HUDChallenges author](https://www.nexusmods.com/fallout76/mods/2860?tab=description)
documents that an Overlay-layer build survives that transition at the cost of
different HUD data and rendering behavior. FCM remains on HUDMenu and makes its room
protocol tolerant of that expected reconstruction rather than changing render layers.

The exact native multi-client incident still requires post-deployment acceptance.
No client artifact is required for this backend-only correction.

### Client replay validation (follow-up candidate)

The Redis copy alone is insufficient: both clients historically required each
message ID to embed the current room, rejecting carried history from the prior
room. Desktop `bridge:history` payloads now carry `historyReplay: true`; the shared
renderer still requires the current binding and row channel, then accepts a
well-formed inherited canonical ID for marked history only. Live messages retain
their current-room check. Repeated history keeps original IDs for deduplication.

For the visible HUD, the relay projects its internal history-read provenance into
`h=<URL-encoded current room>` in the existing negotiated `FCMHUD/1;` targetUserId
carrier. This survives ZFE/xScal's native field filtering. The widget accepts an
inherited ID only when `h` matches its confirmed room; unmarked/stale-room rows
are rejected. Readiness, world-exit clearing and authentication stay unchanged.
No background bridge change is needed. Deploy the compatible backend, update the
portable overlay, and install the tested visible HUD only on machines using that
track (never coinstall it with the background bridge). Older clients fail closed
by hiding inherited rows until updated.

Backend integration tests now serialize replay frames and run them through the
actual shared renderer helper. Both Ruffle provider scenarios exercise marked,
unmarked, stale-room and duplicate rows through the widget/native adapter, plus
world-exit cleanup. Native acceptance still requires a fresh two-client test.

Client replay candidate verification (2026-09-18): all 228 affected backend Jest
tests, 456 backend TypeScript unit tests, 1,241 overlay units, 435 dashboard
units, and all 54 Ruffle scenarios passed. Backend/dashboard/renderer builds,
all chat Haxe tests, native API/auth checks, bridge state/export/package checks,
and SWF/source/archive/package checks passed. The rebuilt HUD archive was
extracted and compared byte-for-byte with the tested SWF. The Electron
interaction suite passed (including reconnects, retained drafts/history and
account changes); its owned processes and temporary profile were removed.
Ruffle's port 41739 was closed after completion. These results do not establish
native game acceptance or hosted deployment. The candidate retains the existing
private build version; it is not a new published release.

The Windows x64 portable candidate also built successfully on the native laptop
runner (1.4.0, 91,121,909 bytes). Its packaged renderer SHA-256 matches the tested
local renderer. The temporary build task was removed. It remains in build
staging, not installed; packaged runtime smoke, release gates and two-client
native acceptance remain pending. The HUD candidate is 2.10.110; its rebuilt BA2
SHA-256 is `21103a134fcd845a39912a1674ab86e1dce0c9e5a6f39a2aa4e6fb44b9cb9e0e`.

### Previous backend-only candidate verification

Local delayed-departure verification (2026-09-18, before the client replay fix): backend TypeScript build,
98 targeted room/bridge tests, 130 native relay tests, 455 backend TS units,
1,241 overlay units and 434 dashboard units passed. All chat Haxe tests,
bridge state/export/package checks, source/BA2/SWF/package checks and all 54
Ruffle scenarios passed. A disposable Redis 7 check confirmed COPY data/TTL,
no-overwrite and missing-source behavior; its container was removed and the
Ruffle listener closed. These are local results, not hosted CI or native
acceptance. No HUD/bridge binaries or installed clients were changed.
