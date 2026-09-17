# Idle renderer investigation — 2026-09-17

Status: local implementation and Linux regression verification; **not native performance acceptance**.
See the [specification](idle-renderer-performance-spec.md) for the full acceptance matrix.

## Findings and scope

- **Confirmed:** the installed desktop Dev renderer previously consumed 114–116% CPU
  (100% = one logical core). A restart required the existing Discord QA authorization;
  authorization succeeded and 325 live rows loaded. No credentials or messages are in this report.
- **Confirmed:** profiles identify the continuous main-tab geometry callback at
  `index-nqGZFQjF.js:33:65575`. With animated names, its layout reads force style/layout
  processing. Removing this callback alone reduced JavaScript time, **not total CPU**.
- **Confirmed:** a retained-history shimmer stress fixture reproduced 115–132% renderer
  CPU. Chromium animation/style/paint work continued after tab polling was removed.
  These early fixture runs retained 500 rows across parent/child responses, not the
  specification's 250-row baseline; do not use them as acceptance benchmarks.
- **Confirmed:** viewport culling in that stress fixture paused 479 offscreen names while
  retaining 63 running letter animations. Visible renderer CPU averaged 73.24% over a
  15-second diagnostic sample. This is a partial improvement, not a claim that visible
  animated effects are inexpensive or that the game's stutter is fixed.
- **Confirmed:** the corrected 250-row, no-animation fixture (60-second warm-up,
  15-second samples) measured renderer/aggregate CPU of **1.52% / 2.98% visible**
  and **1.46% / 2.72% hidden**. Both samples had zero layout/style recalculations.
  These are diagnostic samples, not the required repeated five-minute trials.
- **Confirmed:** corrected 250-row shimmer diagnostics on the initial candidate paused
  229 offscreen names while keeping 63 letter animations running; visible renderer CPU
  averaged 71.04% over five seconds. After the real hide notification, all 250 names
  paused, zero animations ran, and renderer/aggregate CPU averaged **1.59% / 2.98%**.
  Adding a temporary `will-change: opacity` compositor hint did not improve the visible
  sample (77.82% renderer); the experiment was discarded and is not in the candidate.

The shared component now measures tab geometry on resize, tab/DOM changes, ancestor
style changes, font completion and visibility restoration. It still uses layout-pixel
offsets to avoid CSS-zoom errors. Requests coalesce into one animation frame; there is
no recurring tab-measurement frame loop.

Name animations pause outside the scroll viewport plus a 32px pre-entry margin, when
the document is hidden, or after the native overlay's existing visibility notification.
The native hide notification retains its existing 20-second grace period. Pausing
retains animation phase, DOM rows, message IDs, scroll position and transport state.
Other visible effects and the user's reduced-motion preference remain intact. No global
Electron background-throttling change, auth/bridge/roster/protocol change, or HUD edit.

## Verification

- Dashboard: 416 tests across 37 suites, including public-mode lockdown and
  delayed-font cleanup (11 observer tests).
- Overlay: 1,221 tests across 49 suites, including bridge relay/file tests and a
  regression guard against restoring per-letter shimmer or animated shadows.
- Dashboard TypeScript check and dashboard/renderer builds passed.
- Real Electron interaction suite passed: offscreen pause/visible animation, font/theme,
  channel navigation, ten disconnect recoveries, saved preference reload, three font/window
  sizes, account boundary, and 100 hidden messages delivered exactly once without a
  visibility-induced reconnect during simulated game activity.
  Shimmer checks also verify an actual color change with unchanged text, width and
  shadow, inert character spans, and both OS reduced-motion and viewer opt-out.
- Observer tests cover 100 setup/cleanup cycles, queued deliveries after teardown,
  missing ResizeObserver fallback, sibling removal, visibility and mutation coalescing.
- Existing CI `unit-vitest` discovers the new tests. The existing Linux overlay
  interaction gate runs the expanded `test:interaction` suite. Hardware CPU ceilings
  are not asserted on shared CI workers.

The smoke test records the browser's accepted scroll offset before recovery: CSS zoom
can quantize a requested 150px offset to 150.4px. It requires that accepted offset to
remain unchanged, rather than assuming integer CSS coordinates.

## Reproducing profiling

Build a separate non-portable Dev/QA package; never overwrite an installed artifact.
From `cross-platform-overlay/`:

```bash
npm run build:renderer
npx electron-builder --linux dir -c.directories.output=test-results/idle-profile-build -c.extraMetadata.fcmChannel=qa
npm run profile:idle -- /absolute/path/to/linux-unpacked/fallout-chat-mod
FCM_PROFILE_EFFECT=shimmer npm run profile:idle -- /absolute/path/to/linux-unpacked/fallout-chat-mod
```

The runner refuses non-QA/portable packages, uses a local mock relay and temporary
profile, warms each visible/unfocused and hidden state for 60 seconds, then samples
for 15 seconds. Set `FCM_PROFILE_SECONDS=300` for five-minute samples and repeat three
times per state/host per the spec. The corrected fixture supplies exactly 250 General
rows (empty parent history). Hide uses the real native IPC path, not bare
`BrowserWindow.hide()`, which bypasses the app's visibility notification.

Output includes package SHA-256, OS/CPU, row/animation counts, CPU summaries, layout/style
metrics and sampled function locations, never raw messages, credentials or roster names.
CPU uses cumulative process CPU seconds; unavailable counters invalidate a sample rather
than appearing as zero. Full raw profiling data is not saved. The runner closes only its
owned Electron instance, mock sockets/server and temporary profile on completion/failure.

## Remaining acceptance

The full three-trial Linux/Windows reference-host measurements, visible-unfocused live
message paint-latency budget, complete picker/display geometry matrix, mixed-provider
native room continuity, and matched manual in-game frame-time trials are still pending.
Other animated effects and the full live workload still need measurement. Do not claim SS-1,
SS-2 or SS-3 complete, publish a release, or describe gameplay lag as solved from these
short diagnostic profiles. No new candidate installation, deployment or commit/push
was performed for this work.

The user's existing Dev package was temporarily restarted with a loopback debugger
for profiling, then restarted without it and reauthorized through the existing
Discord session. The debugger listener was verified closed. The candidate is kept
separately at `cross-platform-overlay/test-results/idle-profile-build/linux-unpacked/`.
Initial candidate `app.asar` SHA-256:
`767ddf04a787eee9c8a074c4fe879c7511f192288d36232bc70232d6de75b24a`.

## Approved shimmer simplification

The user subsequently approved simplifying shimmer. The revised CSS replaces the
continuous per-letter color/shadow wave with one stepped whole-name color highlight:
0.48 seconds per eight-second cycle, with the existing stable phase. The outline is
static, glyphs remain opaque, and character spans remain inert. Existing offscreen,
hidden and reduced-motion controls apply. This is an explicitly approved visual
change; no other effect was redesigned.

On the same Linux host, sequential 250-row shimmer diagnostics (60-second warm-up,
15-second visible/unfocused samples) measured:

| Metric | Preserved per-letter baseline | Simplified shimmer |
| --- | ---: | ---: |
| Renderer CPU (100% = one logical core) | 71.67% | 7.03% |
| Aggregate app CPU | 90.43% | 9.95% |
| Running animations (21 visible names) | 63 | 21 |
| Layouts during sample | 907 | 0 |
| Style recalculations during sample | 907 | 908 |

Renderer CPU fell about 90% in this fixture. Chromium still evaluates the stepped
animation each frame: this is reduced work, not a zero-work animation. These short
samples are diagnostic, not controlled repeated reference-host acceptance; other
desktop workloads were not stopped. Unit/build work ran during candidate warm-up,
not its measured visible interval. No gameplay improvement is established yet.
The revised hidden sample paused all 250 names, ran zero animations and recorded
zero layout/style recalculations: 1.72% renderer / 3.05% aggregate CPU, compared with
1.59% / 2.85% in the preserved baseline. This small short-sample difference is not
evidence of a hidden-state improvement or regression.

The isolated revised package is at
`cross-platform-overlay/test-results/idle-shimmer-build/linux-unpacked/`.
Its `app.asar` SHA-256 is
`8dcb21703f17526ffc04b9b51c45f88121fe007a5b2866b10325a87407c49f91`.
This follow-up did not restart or replace the installed Dev overlay, touch Prod or
Fallout 76, or change the HUD/bridge. The temporary profiling environments tear down
automatically; the two isolated build artifacts are retained for comparison.
