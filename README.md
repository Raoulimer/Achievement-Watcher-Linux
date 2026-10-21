# Achievement Watcher for Linux

Your Steam achievements on Linux, with unlock times, progress and spoiler-safe hidden achievements, plus a real-time notification and sound when you unlock one in a game (native or Proton).

### How it works
* **Legit Steam, offline.** It reads the files Steam keeps in `appcache/stats` (achievement list, your unlock bits and times). You don't need a Steam Web API key or a public profile, and no third-party server is involved. Native, Flatpak and Snap Steam installs are all detected.
* **Live notifications.** The watchdog (a systemd user service) watches those files with inotify and notifies only for achievements that unlock while you play. Unlocks that Steam Cloud syncs in from another PC stay silent. Notifications go through libnotify (`notify-send`), and the sound plays through PipeWire or PulseAudio. Click a notification to open the achievement in the app.
* **Spoiler-safe.** Locked hidden achievements stay hidden until you choose to show them.
* **Progress milestones.** Achievements tied to a stat notify you at 25 / 50 / 75 %.
* **Session summary (optional).** When you quit a Steam game, it shows the time played and the achievements you earned.
* Steam emulator sources (Goldberg, CODEX, EMPRESS, SKIDROW...) are supported, including when the game runs under Proton as a non-Steam shortcut. Their save folders are found inside each Proton prefix (`steamapps/compatdata/<id>/pfx`), and new ones are picked up within 30 seconds. Achievement names and icons come from Steam's public `IPlayerService/GetGameAchievements` endpoint, so you don't need an API key.

### Install (Ubuntu / Debian / Fedora / Arch)
Requires Node.js >= 22.12 and npm to install, plus `notify-send` (libnotify-bin).
```
./install.sh        # run as your normal user, NOT with sudo
```
`install.sh` installs the dependencies, adds the app-menu entry and enables the `achievement-watchdog` user service. On Ubuntu >= 23.10 it also adds an AppArmor profile (it asks for sudo once), so Electron keeps its sandbox; it never runs with `--no-sandbox`.
Run it again after a `git pull` to update. Uninstall with `./uninstall.sh` (add `--purge` to also remove settings).

* Watchdog logs: `journalctl --user -u achievement-watchdog -f`
* Tests: `cd service/watchdog && npm test`
* Custom Steam location: set `STEAM_ROOT` (for example `systemctl --user edit achievement-watchdog`)

### Notes
* **Over fullscreen games:** GNOME holds normal notifications until you leave fullscreen and always shows them top-center. While a game runs (it detects the Steam `reaper SteamLaunch` process, non-Steam shortcuts included), the watchdog instead draws its own toast in the bottom-right corner (`service/overlay`). It is a small click-through X11 window of type *notification*, which mutter places in its topmost layer (`META_LAYER_OVERRIDE_REDIRECT`) and never gives focus, so the game keeps fullscreen and input. The desktop notification is filed as low urgency, so it goes to the notification list without a duplicate banner. If the toast can't start, it falls back to a critical GNOME banner. Corner, duration and on/off are in Settings > Notification. Nothing is shown over a game in Do Not Disturb.
* A game's achievements appear after you have launched it once with Steam online, because that is when Steam caches them.
* After editing a file loaded by `app/view/app.html`, run `npm run sri` in `app/` to refresh its integrity hashes.

<hr />

A sexy achievement file parser with real-time notification, automatic screenshot and playtime tracking.<br />
View every achievement earned on your PC whether it's coming from Steam, a Steam emulator, and more.<br />
To see the full list of what this app can import please see the [**Wiki/Compatibility**](https://github.com/xan105/Achievement-Watcher/wiki/Compatibility).

<table >
<tr>
<td align="left"><img src="https://github.com/xan105/Achievement-Watcher/raw/1.x/screenshot/home.png" width="400px"></td>
<td align="left"><img src="https://github.com/xan105/Achievement-Watcher/raw/1.x/screenshot/ach_view.png" width="400px"></td>
</tr>
</table>

The original idea behind this app was that some steam emulators generate a text file where your unlocked achievements are stored. 
But they aren't very friendly to know which is which, here is an example :
```ini
[NEW_ACHIEVEMENT_1_1]
Achieved=1
CurProgress=0
MaxProgress=0
UnlockTime=0000000000
[SteamAchievements]
00000=NEW_ACHIEVEMENT_1_1
Count=1
```
So which achievement is NEW_ACHIEVEMENT_1_1 ? You'll have to ask the steam API or look online in a site like the steamdb to find out.
So let's just do that automagically :)

Notification on achievement unlocking
==========================================

Not as sexy as a directX Overlay but it's the next best thing.<br />
Display a notification when you unlock an achievement via<br />
- [Toast notification](https://github.com/xan105/Achievement-Watcher/wiki/Toast-notification) (Windows 8 / 10)
- [Websocket](https://github.com/xan105/Achievement-Watcher/wiki/Websocket-Notification-'API') (Usage example: Twitch overlay) 
- [GNTP (Growl)](https://github.com/xan105/Achievement-Watcher/wiki/GNTP-(Growl-Notification-Transport-Protocol)) (Recommended for Windows 7)

⚠️ **Please verify your system settings for this to work properly**. [More info](https://github.com/xan105/Achievement-Watcher/wiki/Toast-notification#windows-settings)<br />
You can test notification in Settings > Debug to make sure your system is correctly configured or seems to be.<br />
There is a lot of things to check so make sure to have a look at the [wiki](https://github.com/xan105/Achievement-Watcher/wiki/Notification-%22Not-Working%22) before asking for help.

<p align="center">
  <img src="https://github.com/xan105/Achievement-Watcher/raw/1.x/screenshot/live.gif">
</p>

📸 If you have enabled the *souvenir* option(s) then a screenshot and/or video will be taken when you unlock an achievement.<br />

📖 Wiki and troubleshoot
========================

There is a lot to say about this app. So for more info, configuration, troubleshoot, common issues etc ...<br />
Please kindly see the [Wiki](https://github.com/xan105/Achievement-Watcher/wiki), thank you.

Translation Help
================

I do my best to translate everything for every supported language by Steam, but it's rather difficult and I don't speak that much languages.<br />
Fluent in another language ? Any help to add/modify/improve would be greatly appreciated.

More details [here](https://github.com/xan105/achievement-watcher/tree/1.x/app/locale)

How to build
============

### Prequisites:

You will need Node.js 14.x in x64 with NPM installed.<br/>
Innosetup 5 unicode with preprocessor and [Inno Download Plugin](https://mitrichsoftware.wordpress.com/inno-setup-tools/inno-download-plugin/) (building the setup)<br/>

For Node.js you globally need asar and json :<br/>
```
npm install -g asar json
```

There will be some native_module to compile so you'll need :<br/>
VS2017 / C++ build tools, Python ~2.7~ 3.x (node-gyp), and the Windows SDK **10.0.17134.0** (1803 Redstone 4)

### Build:

Install `node_modules` folders with `npm install.cmd`<br/>
or do it yourself with `npm ci` in `/app`, `/service/updater` and `/service/watchdog`.<br/>
Use `buildme.cmd` in the root folder to build.

### Notes: 

+ Most of the native code is now shipped as prebuilt binaries. If you want to compile them yourself I invit you to check out their corresponding repo.<br/>
NB: Golang cgo requires a gcc compiler installed and set in PATH (recommended : http://tdm-gcc.tdragon.net/download).

+ Innosetup is expected to be installed in `C:\Program Files (x86)\Inno Setup 5` if that is not the case then update `buildme.cmd` with the correct path.

+ If NPM gives you some trouble, try to delete every `package-lock.json`.

Legal
=====

⚠️ **Software provided here is purely for informational purposes and does not provide nor encourage illegal access to copyrighted material.**<br />

Software provided here is to be use at your own risk. This is provided as is without any express or implied warranty.<br />
In no event or circumstances will the authors or company be held liable for any damage to yourself or your computer that may arise from the installation or use of the free software aswell as his documentation that is provided on this website.<br />
And for anything that may occur as a result of your use, or inability to use the materials provided via this website.<br />

Software provided here is not affiliated nor associated with any cracking scene groups.<br />

Software provided here is not affiliated nor associated with Steam, © Valve Corporation, Uplay, © Ubisoft and data from theirs API is provided as is without any express or implied warranty.<br />

Other trademarks, copyright are the property of their respective owners. No copyright or trademark infringement is intended by using third-party resources. Except where otherwise specified, the contents of this project is subject to copyright.<br />
