# SPEC — Overlay idle rendering performance

**Status:** Draft

**Version:** 0.1
**Date:** 2026-09-17

Implementation progress and evidence: [local results](idle-renderer-performance-results.md).
The budgets below remain acceptance targets, not achieved results.

## Why

The desktop Dev overlay consumed 114–116% renderer CPU and 14–15% GPU-process CPU
after the game exited. This sustained load can compete with gameplay, but its hot
function and contribution to reported stutter remain unproven. Reduce unnecessary
overlay work while preserving live chat, controls and Server-room continuity.

## Capabilities

1. **CAP-001 — Users can leave static chat open without sustained high CPU use.**
   ↳ Test: Measure visible, unfocused static chat for five minutes; renderer averages
   ≤5% CPU and all overlay processes together average ≤10% CPU.

2. **CAP-002 — Users can hide the overlay without losing live session state.**
   ↳ Test: Hide during an active game session for five minutes; aggregate CPU averages
   ≤3%. Deliver 100 numbered messages, restore visibility, and verify every message
   appears exactly once, without reauthentication or history replay caused by hiding.

3. **CAP-003 — Users can receive chat promptly without focusing the overlay.**
   ↳ Test: Deliver one message/second for 60 seconds and a separate 100-message burst.
   While visible but unfocused, receipt-to-paint p95 ≤250 ms; burst settles within
   two seconds of its final receipt. No missing/duplicate rows or lost draft text.

4. **CAP-004 — Users can move, resize and customize the overlay without stale geometry.**
   ↳ Test: Exercise drag, resize, tab switching, font/scale changes, picker opening,
   scrolling and display changes. Selection borders and anchored menus align within
   two display frames after the final geometry change. Dragging, click-through,
   focus handling and configured hotkeys retain existing behavior.

5. **CAP-005 — Users can change visibility and game state without resource accumulation.**
   ↳ Test: Repeat 100 show/hide and mount/unmount cycles using simulated lifecycle
   events. Owned observers, scheduled work and listeners return to baseline after
   teardown; there are no callbacks against disposed UI and no retained test processes.

6. **CAP-006 — Users can retain Server chat while overlay rendering is idle.**
   ↳ Test: With either supported bridge provider, hide/show and perform same-world
   travel; preserve confirmed room/history and exactly-once delivery. World change,
   logout, account change and expiry still retire stale bindings.

## Constraints

- **Evidence boundary:** desktop installed bridge is 0.2.0/xScal, Dev overlay path
  `~/.local/opt/fcm-dev/1.4.0-bridge020-qLe1qs/`. Renderer PID 2415660 measured 116.4%
  over five seconds and 114.4% over 10.01 seconds; GPU-process PID 2415565 measured
  14.4% and 15.3%. Main process was roughly 1%. Samples identify processes, not hot
  functions; GPU-process CPU is not GPU utilization. No reconnect/error flood was
  observed in checked logs. These short samples are not acceptance benchmarks.
- **Profile before fixing:** capture bounded, local renderer CPU/layout/paint profiles
  on the exact packaged Dev build, both visible and hidden. Rank sampled stacks and
  correlate them with process CPU. Investigate tab-layout frame polling and other
  animations only if attribution supports them. If rendering does not explain the
  measured load, revise the diagnosis before implementation.
- **CPU accounting:** 100% means one fully occupied logical CPU, not whole-machine
  utilization. Sum main, renderer, GPU and utility processes for aggregate figures.
  Record CPU, OS/compositor, display refresh/scale, package hash and visible state.
- **Benchmark protocol:** use identical sanitized fixtures, 250 static text rows,
  warmed caches and 60-second warm-up. Sample at one-second intervals. Run three
  five-minute trials per idle state before/after on the reported Linux desktop and
  Windows laptop; every trial must meet the draft ceilings. Keep unrelated workload
  stable and record it; do not stop other applications without permission. Test
  media/animation separately so the static baseline cannot hide their cost.
- **No cosmetic-only win:** confirm the window is actually visible for visible tests.
  Do not meet budgets by blanking chat, dropping messages, clearing history, disabling
  intended controls, lengthening bridge freshness/lease limits or delaying authentication.
- Preserve visible-unfocused live painting. Do not globally re-enable Electron
  background throttling as an untested shortcut; transport liveness and rendering
  idleness have different requirements.
- Preserve one shared `ChatOverlay` across desktop, website and dashboard, including
  public-mode privacy restrictions. No forked lightweight chat implementation.
- Changes require unit/component tests for scheduling, coalescing and teardown;
  packaged desktop smoke/performance tests on Windows/Linux; shared website/dashboard
  regression checks; and affected bridge tests. Existing required CI must cover new
  deterministic assertions. Hardware CPU thresholds run on recorded reference hosts,
  not arbitrary shared runners. All automated fixtures use local mock services.
- Live game acceptance remains manual: compare overlay off/on in matched static scenes,
  three two-minute trials each, same settings and frame cap. Targets: median frame time
  increases ≤2%, p99 ≤5%. Report noise and raw summaries; do not claim causation from
  unmatched scenes. Failure blocks an in-game performance-improvement claim.
- No game input automation, memory reads, injection, network scanning, extender changes
  or game-process termination. No bridge/HUD architecture, auth, roster or storage-cadence
  changes in this work. Any later HUD-source change requires the complete Haxe/package/
  Ruffle gate plus separate native acceptance.
- Profiles remain local, short-lived and privacy-safe; no telemetry upload, credentials,
  message bodies or roster names in published evidence. Test-owned processes, temporary
  profiles and servers tear down on success/failure; never stop the user's live overlay
  or game as cleanup. Retain only sanitized measurements and intentionally saved artifacts.
- Rollout is Dev-only, preserving the prior artifact/profile for rollback. Installs,
  restarts, production changes and commit/push require the applicable user authorization.

## Non-goals

- Redesigning chat, removing intentional media features or changing visual identity.
- Changing message routing, authentication, roster matching or room assignment.
- Tuning unrelated applications, operating-system scheduling or game settings.
- Claiming all gameplay stutter is caused by the overlay or eliminated by this work.

## Success Signal

**SS-1:** All three idle trials on both reference machines meet CAP-001/002 CPU ceilings;
the reported desktop's visible-idle renderer CPU also falls ≥90% from its matched baseline.

**SS-2:** All six capability tests pass; visible-unfocused receipt-to-paint p95 ≤250 ms,
with zero lost or duplicate test messages and zero leaked owned lifecycle resources.

**SS-3:** Matched manual gameplay trials meet ≤2% median and ≤5% p99 frame-time regression
limits; otherwise native performance acceptance remains pending or failed.
