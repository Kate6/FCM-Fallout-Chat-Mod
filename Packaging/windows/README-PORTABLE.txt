FALLOUT CHAT MOD - WINDOWS PORTABLE - PRODUCTION

QUICK START (NO GAME MOD REQUIRED)
1. Extract the complete ZIP to a writable folder you own, such as Documents/FCM.
   Do not run inside the ZIP, Program Files, or a read-only folder.
2. Run Fallout Chat Mod Portable <version>.exe. Sign in to your FCM account.
   This build connects to https://falloutchatmod.com, NOT hosted Dev.
3. Start Fallout 76. After setup the portable overlay appears when the game is
   detected. Use the tray and configured Open Chat shortcut to access chat.

The EXE creates FCMData beside itself for settings, authentication state and logs.
Keep FCMData beside the EXE when updating or moving the folder. Close the overlay
before replacing the EXE. Do not share FCMData: it contains private login state.
This does not install the overlay or register it to start with Windows.
Updates are notifications only; download and replace the EXE yourself.
If retaining an existing Dev profile, use a NEW folder for this Prod build.

OPTIONAL SERVER CHAT - FCM BRIDGE
Normal community chat does not require a bridge or script extender. The included
Optional FCM Bridge folder is an explicit, MANUAL game-mod installation option.
The overlay never installs it or changes your game files. Do not coinstall it
with the visible FCM HUD widget or legacy FCMBridge.

Install HUDModLoader and ONE compatible official script extender separately:
- ZFE: https://www.nexusmods.com/fallout76/mods/4065
  Requires scoped storage (zfe-storage-v1).
- xScal: https://www.nexusmods.com/fallout76/mods/4183
  Requires the xScal runtime marker and modStorage.register/save.
- HUDModLoader: https://github.com/GitCrazy-wc/hudmodloader
Follow those maintainers' current installation/game-version requirements.
Extender binaries are NOT bundled. Do not install both just for this package.

WITH FALLOUT 76 CLOSED:
1. Back up the files you will change.
2. Copy Optional FCM Bridge/Data/FCMServerBridge.ba2 into the game's Data folder.
3. Add FCMServerBridge once to Data/hudmodloader.ini, preserving other entries.
   The supplied .hudmodloader.ini is a snippet, not a replacement file.
4. Append FCMServerBridge.ba2 to [Archive] sResourceArchive2List in your active
   Documents/My Games/Fallout 76/Fallout76Custom.ini. Preserve HUDModLoader.ba2
   and every unrelated mod entry. Documents may be redirected by Windows.
5. Read Optional FCM Bridge/INSTALL.txt for full setup, cleanup and diagnostics.

This BA2 is compiled for PROD. There is NO native chat endpoint or bridge login
to configure in ZFE/xScal. Sign into the Prod overlay only. The providers write:
  ZFE: Data/ZFE/Storage/FCMServerBridge/prod-state.json
  xScal: Data/modsdata/fcmserverbridge-prod.json
Do not create or edit those exports. ZFE supports documented fallback roots.
F11 -> FCM Server Bridge shows cached provider/roster/storage diagnostics.
Server appears only after fresh observations and authenticated backend approval.
Missing/mutual roster sightings may delay discovery; exports are not guaranteed
world identity. Party chat is separate. Never share raw roster exports or tokens.

ACCEPTANCE STATUS
Automated Ruffle tests do not prove native game stability or provider disk timing.
Full Windows two-client ZFE/xScal acceptance remains required before publication.
Game Pass is not certified. See BUILD.json for bridge version and payload hashes.

REMOVAL
Close the overlay. Remove the portable folder to remove its local settings/login.
To remove the optional bridge, close the game and remove only its BA2 and its
loader/archive-list entries. Preserve unrelated files and your recoverable backups.
