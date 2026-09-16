# Desktop overlay usability validation — 2026-09-16

Implemented on `dev`, based on `9e9ae096`, for the reported font readability,
intermittent chat redraw/tab switching and keyboard hide/show problems. The
reported version is **assumed 1.3.100**, not verified against VvT's binary. The
reporter confirmed a keyboard shortcut; OS and custom binding remain unknown.

## Changes and regression evidence

| Area | Change | Evidence |
| --- | --- | --- |
| Font choice | Independent local font preference, live preview, keyboard picker and native/browser persistence; theme default remains backward compatible | Font/setting unit tests and real Electron font/theme/restart checks |
| Hide/show | Return focus before hiding an interactive overlay; restore inactive during gameplay; cancel owned stale focus helpers/retries | Production window actions exercised with Electron mocks over 20 full cycles, other-app/standalone cases, helper cancellation/timeout |
| Chat lifecycle | Live settings and same-account metadata updates; genuine account changes clear cache, selection and draft | Component tests and actual Electron composer-node/socket assertions; account-switch reset |
| Navigation | Shared component owns cycling, skips hidden channels and wraps through parties | Shared component/pure tests and real Electron General → Trading → Events → General |
| Recovery/history | Current-socket callback guards, pending-connection guard, history-request dedup, legacy pagination correlation and cancellable deferred scroll pins | Duplicate visibility, stale callbacks across ten recoveries, metadata and out-of-order history tests; ten real relay drops retaining message anchor and draft |

Behavioral failures observed before the corresponding fixes included activating
show instead of inactive restore, missing return-to-game on explicit hide,
visibility events creating multiple connection attempts, a superseded socket
adding stale content, and navigation selecting a hidden channel. The Electron
scenario also exposed a delayed tab-scroll callback repinning the reader after
scrolling up; its regression checks the position before any disconnect.

A reconnect notice changes scroll height, so recovery acceptance compares the
visible message's screen offset rather than requiring an unchanged `scrollTop`.
This avoids misclassifying successful browser scroll anchoring as a jump.

## Local checks

- Overlay Vitest: **44 files, 1,163 tests passed**.
- Dashboard Vitest: **34 files, 392 tests passed**.
- Both TypeScript checks and both Vite builds passed.
- Electron interaction under Linux/Xvfb passed: live fonts/theme, same-account
  update, single-step navigation, ten actual localhost WebSocket disconnects,
  draft/message/reading-anchor retention, native preference persistence after
  browser storage removal, and clearing the old composer/draft on account switch.
- Layout checks and screenshots cover Verdana at font scales **9/14/22**, with
  widths **320/520/800** and height 500. The composer stays within the viewport.
- Existing Vite configuration/chunk-size warnings and Node's test localStorage
  warning remain; no renderer exceptions were observed in the interaction run.

Reproduce the interaction check after installing both workspaces' dependencies:

```bash
npm --prefix cross-platform-overlay run build:renderer
xvfb-run -a -s '-screen 0 1920x1080x24' npm --prefix cross-platform-overlay run test:interaction
```

The script creates only a localhost fixture and temporary Electron profile,
removes owned processes/profile data in `finally`, and writes screenshots plus
`result.json` to ignored `cross-platform-overlay/test-results/overlay-usability/`.
It preserves production reconnect backoff/watchdog timing and takes a few minutes.
The script is included in required `overlay-launch-smoke-linux`; both unit suites
remain in required `unit-vitest`.

## Acceptance still pending

### Hosted DEV UI pass

The unpackaged development Electron overlay was launched with an isolated
temporary profile against `https://dev.falloutchatmod.com`. The stored hosted-DEV
persona credential was loaded from the OS keyring; no credential value was logged
or written to evidence. The pass interacted with the actual overlay UI and verified:

- synthetic USER persona login and hosted channel UI load;
- Verdana + White theme apply live while retaining the same composer node and an
  unsent draft, without another WebSocket-ticket request;
- one next-channel action changes `General` to `Trading` exactly once;
- hide/show retains the Trading view and unsent draft;
- renderer reload retains the hosted session and Verdana preference;
- zero renderer page errors and zero console errors.

Machine-readable evidence and login/chat screenshots are in ignored
`cross-platform-overlay/test-results/hosted-dev-ui/`. The temporary Electron
profile and process were removed after the run. No chat message was sent.

The first reload attempt exposed a test/environment configuration issue: the
normal resolver preferred `backend/.env`, whose client-key value in this checkout
was rejected by hosted DEV. The successful run explicitly supplied the existing
root `.env` development client key. No key value was printed. The production
overlay was never opened or modified. This fallback ordering should be reviewed
separately if `npm run dev:cloud` must support fresh/reloaded profiles without an
explicit `APP_CLIENT_KEY`.

Hosted, label-gated CI has not run for these uncommitted workspace changes.
Native Windows/game foreground transfer and a 30-minute gameplay soak remain
unverified. Use the matrix in [overlay-test-plan.md](overlay-test-plan.md#overlay-usability-regression-coverage-2026-09-16)
for 20 hide/show cycles, immediate game movement after typing, Insert, rapid
Alt-Tab, custom binds, click-through and idle modes. Repeat font/layout inspection
on the target OS because local fonts and display scaling differ.

Legacy history replies do not include request IDs. Ambiguous empty pagination
responses release through the five-second timeout rather than incorrectly ending
a channel's history. Complete wire-level correlation would require an additive
backend protocol change; this implementation is compatible with the current relay.

No release/version bump, packaged installation or hosted deployment was performed.
