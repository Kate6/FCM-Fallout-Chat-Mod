# Native HUD contract capture

This collector records the behavior needed to improve the local emulator from a Fallout session
launched and controlled by the developer. It never launches or stops Fallout, edits the game
directory, reads game memory, injects code, scans ports, or copies the installed DLL.

From PowerShell, launch Fallout 76 yourself, enter a world, then run:

```powershell
.\Capture-HudSession.ps1 -GameDirectory 'C:\Program Files (x86)\Steam\steamapps\common\Fallout76' -DurationSeconds 180
```

During the capture: wait for chat to connect; press Insert; type/edit/cancel once; send one synthetic
message; switch channels with Page Up/Down; move selection with Up/Down; exercise one ordinary link,
Discord channel, event, and Discord-ID mention; open F11 customization; change and restore selected
row color; hide/show; leave/rejoin the world; and reload only if that is already part of the test.

Output goes under `simulator/artifacts/native-<run-id>/` and contains artifact fingerprints plus only
new log bytes produced after capture began. Logs are labeled `sim-*` because sanitization means they
are evidence derived from native logs, not untouched provider logs. Review the files before sharing.
The collector records `launchedByCollector=false` and never terminates the recorded PID.

## Linux / Steam Proton

Launch Fallout yourself and enter a world. In another terminal:

```bash
python3 capture_hud_session.py \
  --game-directory /path/to/SteamLibrary/steamapps/common/Fallout76 \
  --duration-seconds 180
```

Use `--pid PID` only when multiple matching Wine/Proton processes make automatic selection
ambiguous. The PID is accepted only if `/proc` ties it to the supplied installation. The collector
does not call `xdotool`, `ydotool`, `hyprctl`, `wine`, Steam, or any virtual-input API. It sends no
keys or signals; all interaction remains manual. The manifest records the Linux session type,
desktop, availability of X11/Wayland displays, and `inputAutomation=false`.
