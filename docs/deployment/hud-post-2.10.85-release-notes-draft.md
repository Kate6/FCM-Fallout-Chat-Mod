# FCM HUD Mod — post-2.10.85 production release (DRAFT)

**Status: native-accepted; commit/hosted CI and release-owner publication confirmation pending.**

Investigation update: source is now **2.10.109 and native-accepted on both providers**. The 2.10.108
capture proved xScal emits contiguous markers when already-consumed entries age out of its
128-entry queue. The HUD now acknowledges those without history replay, while actual cursor gaps
still recover. Fresh 2.10.109 xScal runs on both machines cross the retention boundary without a
single resync or FCM error. Fresh ZFE 0.15.0 launches restore authentication/history on both and
confirm the desktop Server room with populated rosters. Publication remains gated on the accepted
commit, hosted CI, exact artifact verification and release-owner confirmation below.

This is a HUD-only release packet. The last Nexus HUD archive was `2.10.85` (published
2026-09-13). The current source identifies itself as `2.10.109`. Native 2.10.106 restores roster
reads but exposes a separate delayed-ZFE-auth race; 2.10.107 adds automatic pending-auth refresh.
Fresh desktop ZFE logs confirm automatic startup binding, Server sends and one same-room travel
cycle. Desktop and MSI laptop xScal logs confirm automatic authentication and room binding;
the desktop's Server send reconciles without duplication. Candidate 2.10.109 then passes the
former six-minute failure boundary on both xScal machines with contiguous retention markers,
zero resyncs and zero FCM errors. A follow-up ZFE 0.15.0 run restores auth/history on both and
desktop Server membership. Hosted CI and release-owner publication approval remain required.

The desktop overlay, its installer, and the default EULA-safe overlay path are not part of
this release. The HUD is the separate, explicit opt-in HUDModLoader `.ba2` track.

## Verified comparison baseline and scope (2026-09-16)

- The [Nexus files page](https://www.nexusmods.com/fallout76/mods/4082?tab=files) lists
  `FCM HUD Mod-2.10.85 (PROD)-Nexus`, uploaded 13 September 2026, as the current HUD file.
  Its description matches [the previous notes](hud-2.10.85-release-notes.md).
- Source baseline `cdbddbe0` contains widget `VERSION=2.10.85`. Compare that revision to the
  candidate, not the latest desktop-overlay release or the unrelated intermediate diagnostic builds.
- The public [release API](https://falloutchatmod.com/api/releases) still reports HUD `2.10.78`
  alongside overlay `1.3.100`. Website metadata and Nexus are therefore not synchronized.
  Do not describe the website's metadata as proof of the last Nexus upload.
- After fetching origin, `origin/prod` (`8bdab8fe`) and `dev` (`9e9ae096`) have identical trees,
  although their histories differ. The visible HUD's uncommitted 2.10.103-to-2.10.109 delta,
  its tests and owning documentation are the pending promotion, not a backend/overlay update.
- Exclude concurrent changes to `cross-platform-overlay/main.js` and
  `cross-platform-overlay/__tests__/hide-show.test.js`, and any concurrent dashboard/overlay
  renderer or identity edits. Preserve separate background-bridge
  documentation edits locally; do not ship a bridge archive, provider DLL or overlay installer.
- Proposed commit, **not committed; approval required**:
  `fix(hud): restore server binding and queue recovery`

## Proposed public patch notes

- Improved chat responsiveness during busy history and message bursts. The HUD coalesces
  bursty refreshes, reuses unchanged message rows, and keeps rendering in bounded slices.
- Updated the in-game text font mapping for the current Fallout 76 font assets, preventing
  body text from rendering as missing glyphs after the game-font change.
- Improved keyboard and link controls: custom physical bindings are preserved across ZFE and
  xScal, a selected HTTP(S) link can be opened intentionally from the HUD input session, and
  ContainerMode keeps game controls authoritative.
- Added keyboard message-row selection with its own configurable highlight color. Long links
  display compactly while retaining their full target, and link/emoji positioning stays aligned.
- Fixed active/inactive tab coloring and kept file-defined controls authoritative when loading
  saved appearance settings. Added the configurable `activateLinkKey` action (Enter by default);
  a non-empty draft still sends normally.
- Made linking and history recovery more reliable. A completed account link re-arms recovery,
  and history waits for its terminal completion marker instead of treating an early row as a
  complete replay.
- Fixed the missing Server tab after startup: restored native-compatible roster reading and
  automatic pending-ZFE-auth refresh, so sending a message is no longer needed to unlock binding.
- Improved ZFE send handling. Queued native requests now wait for their terminal receipt or
  durable echo, so a pending message is not incorrectly reported as delivered.
- Strengthened Server-chat session safety. The Server sub-tab is shown only after the relay
  confirms the current world-room binding; loading, world changes, stale observations, and
  unsafe provider paths fail closed rather than exposing another world's chat.
- Refined world-roster selection around loading and fast travel so a transient empty auxiliary
  roster cannot unnecessarily clear the current Server history.
- Fixed the long-session xScal history-resync loop. Contiguous markers for already-consumed queue
  retirement are acknowledged without replay, while real forward cursor gaps still recover.

Do not repeat 2.10.85's white-flash fix, six-row slicing, full-word typing, lost-submit recovery,
Insert/Delete defaults, or unified-provider packaging as newly introduced features. This release
builds on them. No claim here covers the separate invisible FCMServerBridge or new backend features.

## Discord announcement draft — not posted

**FCM HUD Mod 2.10.109 — Server-tab recovery and HUD improvements**

This update is for the optional in-game HUD mod only. Desktop overlay downloads are unchanged.

- Restores automatic Server-chat binding after login without needing to send a message first.
- Improves Server-history continuity through ordinary loading and fast travel.
- Adds selectable message rows, independent highlight color, and configurable link activation.
- Improves custom keybind handling and prevents chat from taking input in container mode.
- Updates game-font compatibility and reduces repeated work during busy chat refreshes.
- Improves delayed authentication and ZFE send/history completion handling.
- Stops xScal's bounded queue-retirement notices from triggering repeated history resyncs while
  preserving recovery for actual unread gaps.

Exit Fallout 76 before updating. Replace the HUD BA2 and version stamp, preserve customized
settings and other mods, and merge any new settings from the included instructions. Use one
provider, ZFE or xScal; do not coinstall the visible HUD with FCMBridge/FCMServerBridge.

Download: use the approved HUD-only Nexus file link after upload. No live URL is fabricated here.
Post only after the blocker and release gates below are cleared. Retain the prior announcement
policy: HUD update role only, `suppressNotifications: true`, never `@everyone`.

## Nexus file draft — not uploaded

**Name:** `FCM HUD Mod-2.10.109 (PROD)-Nexus`

**Version:** `2.10.109` (final publication approval pending)

Unified optional HUDModLoader widget for ZFE or xScal, configured for production. Restores
automatic Server-tab binding and native roster compatibility, improves loading continuity,
adds selectable message rows and configurable link opening, improves keybind/config precedence,
updates font/rendering and ZFE delivery handling, and fixes repeated xScal history resyncs caused
by contiguous queue-retirement markers. See the full public patch notes above.

HUD-only update. No desktop overlay, extender DLL, executable, script, or background bridge is
included. Follow INSTALL.txt and preserve your existing loader/archive registrations and settings.

## Internal change inventory since 2.10.85

| Candidate range | Release-relevant change |
| --- | --- |
| 2.10.86–2.10.91 | Row selection, safe link activation, independent selected-row color, URL/emoji offset handling, ContainerMode input safety, and link/history recovery. |
| 2.10.92–2.10.93 | Safety gate for synchronous ZFE Server controls and terminal history completion/draining. |
| 2.10.96–2.10.100 | Provider-aware physical key registration, safe ZFE Server-control capability gate, two-stage ZFE send/control receipts, and GFx-safe receipt parsing. |
| 2.10.101–2.10.102 | Roster source selection and loading/fast-travel continuity safeguards for Server-room binding. |
| 2.10.103 | Shared bounded roster decoder for the visible widget and background bridge, plus render coalescing/row reuse and font correction. **Blocked by native roster snapshot E1014; not release-ready.** |
| 2.10.104 | Direct, copy-only decoder for the visible widget, retaining session safeguards. **Failed native acceptance: E1014 persists.** |
| 2.10.105 | Fixed phase diagnostics and a one-shot local-only decoder probe. **Diagnostic build; not a confirmed fix.** |
| 2.10.106 | Restores earlier widget traversal and map/team helper. **Native populated-roster reads observed; Server joining still blocked by pending auth.** |
| 2.10.107 | Recheck pending ZFE authentication automatically. **Desktop ZFE startup binding, Server-send/echo and one same-room travel cycle pass; both xScal machines bind automatically; desktop xScal send/echo passes. All 35 Ruffle cases pass again. Long-session xScal dropped-event/resync loop blocks release.** |
| 2.10.108 | Adds bounded numeric-only queue diagnostics. **Both-machine native evidence proves xScal's marker is contiguous queue retirement, not an unread gap. Diagnostic-only; not published.** |
| 2.10.109 | Acknowledge contiguous/stale retirement markers while retaining fail-closed recovery for forward or unidentified gaps. **All 37 Ruffle cases and local build gates pass; both xScal machines cross the old boundary with zero resyncs/errors; ZFE 0.15.0 startup/auth/history and desktop Server binding pass.** |

## Release gate

The production release gates are:

1. **Passed:** resolve and regression-test the repeated xScal dropped-event/history-resync loop,
   then retest both machines beyond the observed onset without weakening real gap recovery.
2. **Passed locally:** add a regression test for the fixed behavior, then run the complete HUD source, Haxe,
   package, SWF/BA2, emoji, and Ruffle suites. Shared roster changes must exercise both the
   visible widget and the background bridge.
3. **Passed for release-critical paths:** perform supervised, read-only-log native acceptance on current ZFE and xScal with the game
   user-launched: link/authenticate, receive static history, confirm the Server tab, send and
   receive a Server message, transition through loading/fast travel, and leave to the main menu.
   There must be no roster-snapshot `E1014` and no unconfirmed Server-room exposure.
4. **Pending accepted commit/hosted CI:** build fresh production packages from the accepted commit. Verify the normalized SWF equals
   the BA2-extracted SWF, inspect production endpoint stamps, and generate the separate
   executable-free Nexus archive.
5. **Pending owner confirmation:** before any production publication, confirm the final widget version, public notes, release
   target (`hud`), download URL, and announcement behavior with the release owner.

## Publishing reminder

Use the `hud` release target. On Nexus replace only the existing HUD entry (currently in Main
Files); do not reclassify it or touch the Windows/Linux overlay entries or the overall overlay
version. The HUD remains an optional installation even though Nexus categorizes its file as Main.
The Nexus package must contain no executable or script files. Do not replace the desktop-overlay
download or describe the HUD as required for ordinary Fallout Chat Mod use.

The existing `POST /admin/releases` is not merely a Discord post: it verifies overlay URLs,
upserts release metadata by overlay version, and mirrors to GitHub. Before using it, confirm the
exact HUD URL/version and these metadata side effects with the owner. Preserve the existing
overlay version/download values; never rebuild or overwrite overlay binaries for this HUD update.
No API publish, upload, announcement, commit, push or prod merge has occurred in this preparation.

## Built candidate files — blocked, not approved for upload

Directory: `/tmp/fcm-hud-release-2.10.107-VbN645/`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `FCM HUD Mod-2.10.107 (PROD)-Nexus.zip` | 5,991,085 | `3cdc7ca3e8adf10e37c8e0c54029f8a95fe384d333a8b629aed384a943da85ef` |
| `FCM HUD Mod-2.10.107 (PROD).zip` | 5,992,493 | `f4fee4aa66abe2069c4b6b6ffeefe23cbb83ade6353fd63115a05ef2dc20615e` |

Both contain the exact tested BA2, SHA-256
`1257a2afa27e1f044a99e829c20829f2ee35cf32388bab4e9fb8d79b505de65a`.
The fresh compile, normalized SWF and BA2-extracted SWF compare byte-for-byte. Production
endpoint stamps are verified for both providers, Nexus CRCs pass, and the 17-entry Nexus
manifest contains no executable/script/extender files. All 35 Ruffle cases passed again;
the owned server released its test port. Hosted CI for the new uncommitted delta remains pending.
