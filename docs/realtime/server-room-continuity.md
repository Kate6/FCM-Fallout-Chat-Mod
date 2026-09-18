# Server room continuity

The shared native HUD/desktop bridge coordinator retains server-generated room
affinity on each live roster session. Peer departure no longer changes the
survivor's canonical room/history key simply because the departed peer was the
union-find root. A new mutual member can join an existing room without renaming it.

Affinity is internal Redis metadata, never supplied by clients. Roster refreshes
preserve it only for the same request/session generation. Leave, expiry and new
generations discard it. Coordination writes use XX and KEEPTTL: they neither
recreate an expired roster nor extend observation freshness.

If surviving members of an old room split into disconnected components, none of
those components inherits that shared room. They receive independent rooms until
mutual sightings justify convergence. This deliberately favors isolation over
history continuity when world evidence is ambiguous. Roster inference remains
non-authoritative; there is no trusted game-world ID.

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
component splits and generation/leave boundaries; `localExportBridge.test.js`
covers all four mixed provider pairings, canonical publication/history and peer
departure. Delayed-departure tests cover all four mixed labels (native providers
share the same backend protocol), bridge↔bridge and HUD↔HUD, preservation of IDs
and expiry, desktop replay, future-message isolation and generation boundaries.
`bridgeConnection.test.js` rejects forged replay provenance and cross-room live
messages. Existing backend CI runs these Jest suites without a new workflow.
Native two-client acceptance remains pending deployment/manual testing.

Local delayed-departure verification (2026-09-18): backend TypeScript build,
98 targeted room/bridge tests, 130 native relay tests, 455 backend TS units,
1,241 overlay units and 434 dashboard units passed. All chat Haxe tests,
bridge state/export/package checks, source/BA2/SWF/package checks and all 54
Ruffle scenarios passed. A disposable Redis 7 check confirmed COPY data/TTL,
no-overwrite and missing-source behavior; its container was removed and the
Ruffle listener closed. These are local results, not hosted CI or native
acceptance. No HUD/bridge binaries or installed clients were changed.
