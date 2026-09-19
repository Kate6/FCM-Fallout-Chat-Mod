// Unit tests for the Windows foreground-poller resilience helpers added to
// overlay-core for issue #136 (keybinds fire when FCM is not foreground).
//
// Background: on Windows the global hotkeys are released whenever neither FO76 nor
// the overlay is the foreground window. That release is driven by a single
// long-lived `powershell.exe` foreground poller. The old code nulled the handle on
// death with no restart, no watchdog, and no log — so if the poller died (or never
// started: PowerShell Constrained Language Mode blocks `Add-Type`, AppLocker/AV can
// block powershell.exe) the last-known foreground (the game, while keys were
// registered) froze and the hotkeys stayed registered globally and fired in every
// app. These pure helpers back the self-heal (restart-with-backoff), the fail-safe
// watchdog (release keys when the poller goes silent), and the diagnostic logging.

import core from '../overlay-core.js';
import foregroundScript from '../windows-foreground-script.js';
import { readFileSync } from 'node:fs';

describe('Windows foreground process identity', () => {
  const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../windows-focus-worker.js', import.meta.url), 'utf8');
  const script = foregroundScript.buildForegroundScript(1234);
  const poller = source.slice(source.indexOf('function spawnWindowsForegroundPoller()'), source.indexOf('function spawnWindowsForegroundPoller()') + 4000);
  it('canonicalizes only the owning Electron PID, independent of portable product name', () => {
    expect(poller).toContain('buildForegroundScript(process.pid)');
    expect(script).toContain('if(pid==1234) name="fallout-chat-mod"');
    expect(script).toContain('name=process.ProcessName');
    expect(script).toContain('pid!=previous || heartbeat.ElapsedMilliseconds>=1000');
    expect(script).toContain('Thread.Sleep(100)');
    expect(script).not.toContain('Get-Process');
  });
  it('retains cancellation when a different application takes foreground', () => {
    expect(poller).toContain("!overlayCore.isOverlayClass(foreground)) cancelGameFocusReturn('windows-other-foreground', foregroundOwnerPid)");
    expect(core.isOverlayClass('fallout-chat-mod')).toBe(true);
    expect(core.isOverlayClass('notepad')).toBe(false);
    expect(core.isOverlayClass('Fallout Chat Mod Portable Experimental')).toBe(false);
  });
  it('records bounded owner metadata separately from foreground classification', () => {
    expect(script).toContain('Console.WriteLine("FCM_OWNER_PID="+pid)');
    expect(poller).toContain("foregroundOwnerPid = Number(line.slice('FCM_OWNER_PID='.length))");
    expect(worker).toContain("this.stop('request-timeout')");
    expect(source).toContain("cancelGameFocusReturn('show-window')");
    expect(source).toContain("cancelGameFocusReturn('focus-chat')");
    expect(worker).toContain("'[focus-worker] result='");
  });
  it('keeps Windows foreground while the guarded game activation is pending', () => {
    const handoff = source.slice(source.indexOf('function returnFocusToGame()'), source.indexOf("  if (IS_LINUX) {", source.indexOf('function returnFocusToGame()')));
    expect(handoff).toContain("if (process.platform !== 'win32') {\n    try { mainWindow.blur(); } catch { /* ignore */ }\n  }");
    expect(handoff).toContain("sendToRenderer('overlay:blur-input')");
    expect(handoff).toContain('windowsFocusWorker.request()');
    expect(worker).toContain('owner!=${ownerPid}');
  });
});

const { nextPollerBackoffMs, isForegroundStale, classifyPollerExit } = core;

describe('bounded native game presence', () => {
  it('parses presence independently from foreground identity and preserves unknown failures', () => {
    expect(foregroundScript.parseGamePresenceLine('FCM_GAME_RUNNING=1')).toBe(true);
    expect(foregroundScript.parseGamePresenceLine('FCM_GAME_RUNNING=0')).toBe(false);
    expect(foregroundScript.parseGamePresenceLine('FCM_GAME_RUNNING=?')).toBe(null);
    for (const line of ['fallout76', 'FCM_OWNER_PID=42', 'FCM_GAME_RUNNING=11', 'FCM_GAME_RUNNING=']) {
      expect(foregroundScript.parseGamePresenceLine(line)).toBe(undefined);
    }
  });
  it('expires presence so startup, helper failure and stale observations retain the fallback', () => {
    expect(foregroundScript.isGamePresenceFresh(10000, 12500)).toBe(true);
    expect(foregroundScript.isGamePresenceFresh(10000, 16000)).toBe(true);
    for (const [stamp, now] of [[0, 100], [10000, 16001], [10000, 9999], [NaN, 11000]]) {
      expect(foregroundScript.isGamePresenceFresh(stamp, now)).toBe(false);
    }
  });
  it('uses a process-only OS snapshot in the existing worker and always closes it', () => {
    const script = foregroundScript.buildForegroundScript(1234);
    expect(script).toContain('presence.ElapsedMilliseconds>=2500');
    expect(script).toContain('"Fallout76.exe",StringComparison.OrdinalIgnoreCase');
    expect(script).toContain('"Project76_GamePass.exe",StringComparison.OrdinalIgnoreCase');
    expect(script).toContain('CreateToolhelp32Snapshot(0x00000002,0)');
    expect(script).toContain('finally { CloseHandle(snapshot); }');
    expect(script).toContain('entry.size=(uint)Marshal.SizeOf(typeof(ProcessEntry))');
    expect(script).toContain('if(error!=18) throw');
    expect(script).toContain('Console.WriteLine("FCM_GAME_RUNNING="');
    expect(script).not.toMatch(/ReadProcessMemory|SendInput|SetForegroundWindow/);
  });
});

describe('nextPollerBackoffMs', () => {
  it('ramps 1s → 2s → 5s for the first three restarts', () => {
    expect(nextPollerBackoffMs(0)).toBe(1000);
    expect(nextPollerBackoffMs(1)).toBe(2000);
    expect(nextPollerBackoffMs(2)).toBe(5000);
  });

  it('caps at 5s for any further restarts (never unbounded)', () => {
    expect(nextPollerBackoffMs(3)).toBe(5000);
    expect(nextPollerBackoffMs(10)).toBe(5000);
    expect(nextPollerBackoffMs(9999)).toBe(5000);
  });

  it('treats negative / NaN / non-integer counts as the first restart', () => {
    expect(nextPollerBackoffMs(-1)).toBe(1000);
    expect(nextPollerBackoffMs(NaN)).toBe(1000);
    expect(nextPollerBackoffMs(undefined)).toBe(1000);
    expect(nextPollerBackoffMs(1.9)).toBe(2000); // floored to 1
  });
});

describe('isForegroundStale', () => {
  const staleMs = 4000;

  it('is NOT stale while fresh foreground lines keep arriving', () => {
    expect(isForegroundStale({ lastLineAt: 10_000, now: 11_000, staleMs })).toBe(false);
    expect(isForegroundStale({ lastLineAt: 10_000, now: 14_000, staleMs })).toBe(false); // exactly at threshold
  });

  it('is stale once no line has arrived for longer than staleMs (fail closed)', () => {
    expect(isForegroundStale({ lastLineAt: 10_000, now: 14_001, staleMs })).toBe(true);
    expect(isForegroundStale({ lastLineAt: 10_000, now: 99_999, staleMs })).toBe(true);
  });

  it('treats a never-seen line (lastLineAt 0/null) as stale when enough time has passed', () => {
    expect(isForegroundStale({ lastLineAt: 0, now: 5000, staleMs })).toBe(true);
    expect(isForegroundStale({ lastLineAt: null, now: 5000, staleMs })).toBe(true);
  });

  it('refuses to trip on invalid inputs (no now / no staleMs / non-positive staleMs)', () => {
    expect(isForegroundStale({ lastLineAt: 0, staleMs })).toBe(false);
    expect(isForegroundStale({ lastLineAt: 0, now: 5000 })).toBe(false);
    expect(isForegroundStale({ lastLineAt: 0, now: 5000, staleMs: 0 })).toBe(false);
    expect(isForegroundStale({ lastLineAt: 0, now: 5000, staleMs: -1 })).toBe(false);
    expect(isForegroundStale()).toBe(false);
  });
});

describe('classifyPollerExit', () => {
  it('flags a fast exit that never emitted a line as blocked-or-clm (the CLM/AppLocker signature)', () => {
    expect(classifyPollerExit({ msSinceStart: 50, everEmitted: false })).toBe('blocked-or-clm');
    expect(classifyPollerExit({ msSinceStart: 1499, everEmitted: false })).toBe('blocked-or-clm');
  });

  it('treats an exit AFTER emitting output as a normal crash (poller had been working)', () => {
    expect(classifyPollerExit({ msSinceStart: 50, everEmitted: true })).toBe('crashed');
    expect(classifyPollerExit({ msSinceStart: 999_999, everEmitted: true })).toBe('crashed');
  });

  it('treats a slow exit with no output as a crash, not a blocked launch', () => {
    expect(classifyPollerExit({ msSinceStart: 1500, everEmitted: false })).toBe('crashed');
    expect(classifyPollerExit({ msSinceStart: 60_000, everEmitted: false })).toBe('crashed');
  });

  it('respects a custom quickExitMs threshold', () => {
    expect(classifyPollerExit({ msSinceStart: 200, everEmitted: false, quickExitMs: 100 })).toBe('crashed');
    expect(classifyPollerExit({ msSinceStart: 50, everEmitted: false, quickExitMs: 100 })).toBe('blocked-or-clm');
  });

  it('tolerates being called with no argument (defaults to crashed)', () => {
    expect(classifyPollerExit()).toBe('crashed');
  });
});
