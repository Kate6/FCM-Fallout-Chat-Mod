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

Messages remain under the same capped, one-hour-idle Redis history policy. This
does not promise unlimited retention or reconstruct history already stranded by
an earlier room reassignment. Clients and their authentication protocols do not
change. Older backend instances must be drained before relying on continuity,
since they do not maintain the new optional room metadata.

Regression coverage: `worldRoomContinuity.test.js` covers either peer departing,
component splits and generation/leave boundaries; `localExportBridge.test.js`
covers all four mixed provider pairings, canonical publication/history and peer
departure. Native two-client acceptance remains pending deployment/manual testing.
