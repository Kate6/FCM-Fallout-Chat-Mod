'use strict';
function buildForegroundScript(ownerPid) {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('Invalid owner PID');
  return `
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public class FCMForeground {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h,out int pid);
 // PROCESS-only OS metadata snapshot: no module/heap flags, process handles,
 // game-memory access or input APIs. Close the snapshot on every path.
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 struct ProcessEntry {
  public uint size,usage,pid; public UIntPtr heap;
  public uint module,threads,parent; public int priority; public uint flags;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string exe;
 }
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Process32FirstW(IntPtr snapshot,ref ProcessEntry entry);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Process32NextW(IntPtr snapshot,ref ProcessEntry entry);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 static bool HasGameProcess() {
  IntPtr snapshot=CreateToolhelp32Snapshot(0x00000002,0); // TH32CS_SNAPPROCESS only
  if(snapshot==new IntPtr(-1) || snapshot==IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  try {
   var entry=new ProcessEntry(); entry.size=(uint)Marshal.SizeOf(typeof(ProcessEntry));
   if(!Process32FirstW(snapshot,ref entry)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
   do {
    if(String.Equals(entry.exe,"Fallout76.exe",StringComparison.OrdinalIgnoreCase)
      || String.Equals(entry.exe,"Project76_GamePass.exe",StringComparison.OrdinalIgnoreCase)) return true;
   } while(Process32NextW(snapshot,ref entry));
   int error=Marshal.GetLastWin32Error();
   if(error!=18) throw new System.ComponentModel.Win32Exception(error); // ERROR_NO_MORE_FILES
   return false;
  } finally { CloseHandle(snapshot); }
 }
 public static void Run() {
  int previous=-1; var heartbeat=Stopwatch.StartNew();
  var presence=Stopwatch.StartNew(); bool firstPresence=true;
  while(true) {
   if(firstPresence || presence.ElapsedMilliseconds>=2500) {
    string running="?";
    try { running=HasGameProcess() ? "1" : "0"; }
    catch { }
    Console.WriteLine("FCM_GAME_RUNNING="+running);
    firstPresence=false; presence.Restart();
   }
   int pid=0; GetWindowThreadProcessId(GetForegroundWindow(),out pid);
   if(pid!=previous || heartbeat.ElapsedMilliseconds>=1000) {
    string name="";
    try { if(pid==${ownerPid}) name="fallout-chat-mod";
      else using(var process=Process.GetProcessById(pid)) name=process.ProcessName;
    } catch { }
    Console.WriteLine("FCM_OWNER_PID="+pid); Console.WriteLine(name);
    previous=pid; heartbeat.Restart();
   }
   Thread.Sleep(100);
  }
 }
}
'@
[FCMForeground]::Run()
`;
}
function parseGamePresenceLine(line) {
  if (line === 'FCM_GAME_RUNNING=1') return true;
  if (line === 'FCM_GAME_RUNNING=0') return false;
  if (line === 'FCM_GAME_RUNNING=?') return null;
  return undefined;
}
function isGamePresenceFresh(stamp, now) {
  return Number.isFinite(stamp) && stamp > 0 && Number.isFinite(now) && now >= stamp && now - stamp <= 6000;
}
module.exports = { buildForegroundScript, parseGamePresenceLine, isGamePresenceFresh };
