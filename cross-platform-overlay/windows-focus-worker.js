'use strict';

// One owned, sleeping worker. Compile interop once, not on every submitted message.
function buildFocusScript(ownerPid, dryRun = false) {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('Invalid owner PID');
  return `
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public class FCMFocus {
 [DllImport("user32")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32")] public static extern int GetClassName(IntPtr h,System.Text.StringBuilder b,int n);
 [DllImport("user32")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32")] public static extern void keybd_event(byte k,byte s,uint f,IntPtr e);
 public static void Run(bool dryRun) {
  Console.WriteLine("READY");
  string line;
  while ((line=Console.ReadLine()) != null) {
   var parts=line.Split(':'); long id, deadline;
   if(parts.Length!=2 || !long.TryParse(parts[0],out id) || !long.TryParse(parts[1],out deadline)) continue;
   var clock=Stopwatch.StartNew(); string result="no-game";
   try {
    if(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()>deadline) result="expired";
    else if(dryRun) result="dry-run";
    else {
     Process game=null;
     foreach(var name in new [] {"Fallout76","Project76_GamePass"}) {
      foreach(var p in Process.GetProcessesByName(name)) {
       if(game==null && p.MainWindowHandle!=IntPtr.Zero) game=p; else p.Dispose();
      }
     }
     if(game!=null) using(game) {
      var fg=GetForegroundWindow(); uint owner; GetWindowThreadProcessId(fg,out owner);
      var cls=new System.Text.StringBuilder(256); GetClassName(fg,cls,256);
      if(owner!=${ownerPid} && owner!=game.Id && owner!=0 && cls.ToString()!="Progman" && cls.ToString()!="WorkerW") result="other-app";
      else if(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()>deadline) result="expired";
      else {
       keybd_event(0x12,0,0,IntPtr.Zero); keybd_event(0x12,0,2,IntPtr.Zero);
       ShowWindow(game.MainWindowHandle,9);
       result=SetForegroundWindow(game.MainWindowHandle)?"activated":"denied";
      }
     }
    }
   } catch { result="failed"; }
   Console.WriteLine("DONE:"+id+":"+result+":"+clock.ElapsedMilliseconds);
  }
 }
}
'@
[FCMFocus]::Run(${dryRun ? '$true' : '$false'})
`;
}

class WindowsFocusWorker {
  constructor({ spawn, ownerPid, log = () => {}, now = Date.now, script } = {}) {
    this.spawn = spawn; this.log = log; this.now = now;
    this.script = script || buildFocusScript(ownerPid);
    this.child = null; this.ready = false; this.pending = null;
    this.serial = 0; this.closed = false; this.retryAt = 0;
  }
  start() {
    if (this.closed || this.child || this.now() < this.retryAt) return;
    const started = this.now();
    let child;
    try {
      child = this.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-EncodedCommand', Buffer.from(this.script, 'utf16le').toString('base64')], { windowsHide: true });
    } catch { this.retryAt = this.now() + 5000; this.log('[focus-worker] spawn failed'); return; }
    this.child = child; this.ready = false;
    let buffer = '';
    const startup = setTimeout(() => { if (this.child === child && !this.ready) this.stop('startup-timeout'); }, 5000);
    this.startupTimer = startup;
    startup.unref?.();
    child.stdin.on('error', () => { if (this.child === child) this.stop('write-error'); });
    child.stderr.on('data', () => {}); // Drain, never log script/environment contents.
    child.stdout.on('data', data => {
      if (this.child !== child) return;
      buffer += data.toString();
      if (buffer.length > 4096) { this.stop('invalid-output'); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (line === 'READY') {
          clearTimeout(startup); this.ready = true;
          this.log('[focus-worker] ready startupMs=' + (this.now() - started));
          this.flush();
        } else {
          const match = /^DONE:(\d+):(activated|denied|other-app|no-game|expired|failed|dry-run):(\d+)$/.exec(line);
          if (match && this.pending?.id === Number(match[1])) {
            const p = this.pending; clearTimeout(p.timer); this.pending = null;
            this.log('[focus-worker] result=' + match[2] + ' roundTripMs=' + (this.now() - p.at) + ' nativeMs=' + match[3]);
          }
        }
      }
    });
    const ended = () => {
      clearTimeout(startup);
      if (this.child === child) this.stop('worker-exit');
    };
    child.once('error', ended); child.once('exit', ended);
  }
  request() {
    if (this.closed) return false;
    this.cancel('superseded'); this.start();
    if (!this.child) return false;
    const p = { id: ++this.serial, at: this.now(), sent: false, timer: null };
    this.pending = p;
    p.timer = setTimeout(() => { if (this.pending === p) this.stop('request-timeout'); }, 3000);
    p.timer.unref?.(); this.flush(); return true;
  }
  flush() {
    const p = this.pending;
    if (!this.ready || !p || p.sent) return;
    p.sent = true;
    try { this.child.stdin.write(p.id + ':' + (p.at + 3000) + '\n'); }
    catch { this.stop('write-error'); }
  }
  cancel(reason = 'cancelled') {
    if (!this.pending) return;
    // Retire the exact worker on cancellation: no queued old command may steal
    // focus from a newly opened composer. Ordinary successful calls reuse it.
    this.stop(reason, false);
  }
  stop(reason, backoff = true) {
    clearTimeout(this.startupTimer);
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null; this.ready = false;
    const child = this.child; this.child = null;
    if (backoff) this.retryAt = this.now() + 5000;
    if (child) {
      try { child.stdin.end(); } catch { /* pipe closed */ }
      try { child.kill(); } catch { /* exited */ }
    }
    this.log('[focus-worker] stopped reason=' + reason);
  }
  dispose() { this.closed = true; this.stop('shutdown', false); }
}
module.exports = { WindowsFocusWorker, buildFocusScript };
