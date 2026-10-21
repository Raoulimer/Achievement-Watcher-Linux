"use strict";

/*
  Offline access to the legit Steam client data on Linux.
  No Web API key, no public profile and no third-party server needed:
  Steam keeps the achievement schema and the user's unlock state in appcache/stats.

  appcache/stats/UserGameStatsSchema_<appid>.bin
    <appid> > stats > <statId> > { type, name, bits > <bit> > { name, display > { name, desc, hidden, icon, icon_gray }, progress } }
  appcache/stats/UserGameStats_<accountId>_<appid>.bin
    cache > <statId> > { data (bitfield or stat value), AchievementTimes > <bit>: unix time }
*/

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const https = require("https");
const { pathToFileURL } = require("url");
const { parseBinary, parseText, getKey } = require("./kv.js");

const STEAMID64_BASE = 76561197960265728n;
const CDN = "https://cdn.akamai.steamstatic.com";

function candidateRoots() {
  if (process.env.STEAM_ROOT) return [process.env.STEAM_ROOT]; //explicit override (custom install, tests)
  const home = os.homedir();
  const list = [
    path.join(home, ".steam/steam"),
    path.join(home, ".steam/root"),
    path.join(home, ".local/share/Steam"),
    path.join(home, ".var/app/com.valvesoftware.Steam/.local/share/Steam"), //Flatpak
    path.join(home, "snap/steam/common/.local/share/Steam") //Snap
  ];
  return list.filter(Boolean);
}

//Every distinct Steam install found on this machine (symlinks resolved)
function findSteamRoots(extra = []) {
  const found = [];
  for (const dir of [...extra, ...candidateRoots()]) {
    try {
      const real = fs.realpathSync(dir);
      if (found.includes(real)) continue;
      if (fs.existsSync(path.join(real, "appcache")) || fs.existsSync(path.join(real, "steamapps"))) found.push(real);
    } catch { /* not there */ }
  }
  return found;
}

async function readText(file) {
  return parseText(await fsp.readFile(file, "utf8"));
}

function toAccountId(steamid64) {
  return (BigInt(steamid64) - STEAMID64_BASE).toString();
}

function toSteamId64(accountId) {
  return (BigInt(accountId) + STEAMID64_BASE).toString();
}

//Users who logged in on this Steam install
async function getUsers(root) {
  const users = new Map();

  try {
    const login = getKey(await readText(path.join(root, "config/loginusers.vdf")), "users") || {};
    for (const [steamid64, info] of Object.entries(login)) {
      const accountId = toAccountId(steamid64);
      users.set(accountId, {
        accountId,
        steamid64,
        name: getKey(info, "PersonaName") || accountId,
        mostRecent: getKey(info, "MostRecent") === "1",
        timestamp: +getKey(info, "Timestamp") || 0
      });
    }
  } catch { /* loginusers.vdf missing */ }

  try {
    for (const dir of await fsp.readdir(path.join(root, "userdata"))) {
      if (!/^\d+$/.test(dir) || dir === "0" || users.has(dir)) continue;
      users.set(dir, { accountId: dir, steamid64: toSteamId64(dir), name: dir, mostRecent: false, timestamp: 0 });
    }
  } catch { /* no userdata */ }

  return [...users.values()].sort((a, b) => (b.mostRecent - a.mostRecent) || (b.timestamp - a.timestamp));
}

//Every Steam library folder of this install (the install itself + libraryfolders.vdf)
async function getLibraries(root) {
  const libraries = new Set([root]);
  try {
    const folders = getKey(await readText(path.join(root, "steamapps/libraryfolders.vdf")), "libraryfolders") || {};
    for (const entry of Object.values(folders)) {
      const libPath = (typeof entry === "object") ? getKey(entry, "path") : entry;
      if (libPath) libraries.add(libPath);
    }
  } catch { /* single library */ }
  return libraries;
}

//Installed apps across every Steam library folder
async function getInstalledApps(root) {
  const apps = new Map();
  for (const lib of await getLibraries(root)) {
    let files = [];
    try {
      files = (await fsp.readdir(path.join(lib, "steamapps"))).filter(f => /^appmanifest_\d+\.acf$/.test(f));
    } catch { continue; }
    for (const file of files) {
      try {
        const state = getKey(await readText(path.join(lib, "steamapps", file)), "AppState");
        const appid = getKey(state, "appid");
        if (!appid) continue;
        apps.set(appid.toString(), {
          appid: appid.toString(),
          name: getKey(state, "name"),
          installdir: path.join(lib, "steamapps/common", getKey(state, "installdir") || ""),
          library: lib
        });
      } catch { /* malformed manifest */ }
    }
  }
  return apps;
}

//Appids with a local achievement state for this user
async function listStatsApps(root, accountId) {
  try {
    const re = new RegExp(`^UserGameStats_${accountId}_(\\d+)\\.bin$`);
    return (await fsp.readdir(path.join(root, "appcache/stats")))
      .map(f => f.match(re)?.[1])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function pickLang(obj, lang) {
  if (obj == null) return "";
  if (typeof obj !== "object") return obj.toString();
  return getKey(obj, lang) ?? getKey(obj, "english") ?? Object.values(obj).find(v => typeof v === "string") ?? "";
}

function iconURL(appid, file) {
  return file ? `${CDN}/steamcommunity/public/images/apps/${appid}/${file}` : null;
}

async function readSchema(root, appid, lang = "english") {
  const file = path.join(root, "appcache/stats", `UserGameStatsSchema_${appid}.bin`);
  const parsed = parseBinary(await fsp.readFile(file));
  const data = getKey(parsed, appid.toString()) || Object.values(parsed)[0] || {};
  const stats = getKey(data, "stats") || {};

  const statNames = {}; //stat api name -> statId (for progress)
  const achievements = [];

  for (const [statId, stat] of Object.entries(stats)) {
    if (stat && stat.name) statNames[stat.name] = statId;
    const bits = getKey(stat, "bits");
    if (!bits) continue;
    for (const [bit, entry] of Object.entries(bits)) {
      const display = getKey(entry, "display") || {};
      const progress = getKey(entry, "progress");
      achievements.push({
        name: getKey(entry, "name"),
        displayName: pickLang(getKey(display, "name"), lang),
        description: pickLang(getKey(display, "desc"), lang),
        hidden: (+getKey(display, "hidden") === 1) ? 1 : 0,
        icon: iconURL(appid, getKey(display, "icon")),
        icongray: iconURL(appid, getKey(display, "icon_gray")),
        statId,
        bit: +bit,
        progress: progress ? {
          min: +getKey(progress, "min_val") || 0,
          max: +getKey(progress, "max_val") || 0,
          stat: getKey(getKey(progress, "value"), "operand1")
        } : null
      });
    }
  }

  //Stable order: statId then bit
  achievements.sort((a, b) => (+a.statId - +b.statId) || (a.bit - b.bit));

  const gamename = getKey(data, "gamename");
  return {
    gamename: (gamename && !/^ValveTestApp\d+$/.test(gamename)) ? gamename : null,
    version: getKey(data, "version"),
    statNames,
    achievements
  };
}

async function readUserStats(root, accountId, appid) {
  const file = path.join(root, "appcache/stats", `UserGameStats_${accountId}_${appid}.bin`);
  const cache = getKey(parseBinary(await fsp.readFile(file)), "cache") || {};
  const stats = {};
  for (const [statId, stat] of Object.entries(cache)) {
    if (!/^\d+$/.test(statId) || typeof stat !== "object") continue;
    const times = {};
    for (const [bit, time] of Object.entries(getKey(stat, "AchievementTimes") || {})) times[bit] = +time;
    stats[statId] = { data: getKey(stat, "data") ?? 0, times };
  }
  return stats;
}

//Schema merged with the user's state: what the app and the watchdog both need
async function getAchievements(root, accountId, appid, lang = "english") {
  const schema = await readSchema(root, appid, lang);
  let stats = {};
  try {
    stats = await readUserStats(root, accountId, appid);
  } catch { /* never launched: everything locked */ }

  const list = schema.achievements.map((ach) => {
    const stat = stats[ach.statId];
    const unlocked = stat ? (((stat.data >>> ach.bit) & 1) === 1) : false;
    const time = stat?.times?.[ach.bit] || 0;

    let CurProgress = 0;
    let MaxProgress = 0;
    if (ach.progress && ach.progress.max > 0) {
      const statId = schema.statNames[ach.progress.stat];
      MaxProgress = ach.progress.max;
      CurProgress = Math.min(+(stats[statId]?.data || 0), MaxProgress);
    }

    return {
      name: ach.name,
      displayName: ach.displayName,
      description: ach.description,
      hidden: ach.hidden,
      icon: ach.icon,
      icongray: ach.icongray,
      Achieved: unlocked,
      UnlockTime: unlocked ? time : 0,
      CurProgress,
      MaxProgress
    };
  });

  return { gamename: schema.gamename, list };
}

function fileURL(file) {
  return pathToFileURL(file).href;
}

//Artwork Steam already downloaded for the library view (both old flat and new per-app folder layouts)
function getLocalArt(root, appid) {
  const cache = path.join(root, "appcache/librarycache");
  const dir = path.join(cache, appid.toString());
  const pick = (...files) => {
    for (const f of files) if (fs.existsSync(f)) return fileURL(f);
    return null;
  };

  let icon = null;
  try {
    const hashed = fs.readdirSync(dir).find(f => /^[0-9a-f]{40}\.(jpg|png)$/.test(f));
    if (hashed) icon = fileURL(path.join(dir, hashed));
  } catch { /* old layout */ }

  return {
    header: pick(path.join(dir, "header.jpg"), path.join(cache, `${appid}_header.jpg`)),
    portrait: pick(path.join(dir, "library_600x900.jpg"), path.join(cache, `${appid}_library_600x900.jpg`)),
    background: pick(path.join(dir, "library_hero.jpg"), path.join(cache, `${appid}_library_hero.jpg`)),
    icon
  };
}

function getRemoteArt(appid) {
  return {
    header: `${CDN}/steam/apps/${appid}/header.jpg`,
    portrait: `${CDN}/steam/apps/${appid}/library_600x900.jpg`,
    background: `${CDN}/steam/apps/${appid}/page_bg_generated_v6b.jpg`,
    icon: null
  };
}

//Steam's own playtime counters (minutes) and last played time (unix)
async function getPlaytime(root, accountId) {
  try {
    const cfg = await readText(path.join(root, "userdata", accountId, "config/localconfig.vdf"));
    let node = getKey(cfg, "UserLocalConfigStore");
    for (const key of ["Software", "Valve", "Steam", "apps"]) node = getKey(node, key);
    const result = {};
    for (const [appid, app] of Object.entries(node || {})) {
      result[appid] = {
        playtime: (+getKey(app, "Playtime") || 0) * 60, //seconds
        lastplayed: +getKey(app, "LastPlayed") || 0
      };
    }
    return result;
  } catch {
    return {};
  }
}

/*
  Appids of games currently launched by Steam.
  Steam starts every game (native or Proton) through: reaper SteamLaunch AppId=<appid> -- ...
*/
async function getRunningAppIds() {
  const running = new Set();
  let pids = [];
  try {
    pids = (await fsp.readdir("/proc")).filter(p => /^\d+$/.test(p));
  } catch {
    return running;
  }
  await Promise.all(pids.map(async (pid) => {
    try {
      const cmdline = await fsp.readFile(`/proc/${pid}/cmdline`, "utf8");
      if (!cmdline.includes("SteamLaunch")) return;
      const match = cmdline.match(/AppId=(\d+)/);
      if (match) running.add(match[1]);
    } catch { /* process exited */ }
  }));
  return running;
}

/*
  Steam emulators write their achievement files in Windows locations. Under Proton those live inside
  the game's prefix: <library>/steamapps/compatdata/<appid or non-Steam shortcut id>/pfx/drive_c
*/
const EMULATOR_DIRS = [
  { source: "CODEX", dir: "users/Public/Documents/Steam/CODEX" },
  { source: "CODEX", dir: "users/steamuser/AppData/Roaming/Steam/CODEX" },
  { source: "Goldberg", dir: "users/steamuser/AppData/Roaming/Goldberg SteamEmu Saves" },
  { source: "Goldberg", dir: "users/steamuser/AppData/Roaming/GSE Saves" },
  { source: "EMPRESS", dir: "users/steamuser/AppData/Roaming/EMPRESS" },
  { source: "EMPRESS", dir: "users/Public/Documents/EMPRESS" },
  { source: "SKIDROW", dir: "users/steamuser/AppData/Local/SKIDROW" },
  { source: "SKIDROW", dir: "users/steamuser/Documents/SkidRow" },
  { source: "SmartSteamEmu", dir: "users/steamuser/AppData/Roaming/SmartSteamEmu" },
  { source: "CreamAPI", dir: "users/steamuser/AppData/Roaming/CreamAPI" }
];

//Async and in parallel: libraries often sit on slow disks (NTFS, USB) and the watchdog rescans every 30s
const isDir = (dir) => fsp.stat(dir).then(s => s.isDirectory(), () => false);

async function getProtonPrefixes() {
  const prefixes = [];
  for (const root of findSteamRoots()) {
    for (const lib of await getLibraries(root)) {
      const compat = path.join(lib, "steamapps/compatdata");
      let ids = [];
      try { ids = await fsp.readdir(compat); } catch { continue; }
      const found = await Promise.all(ids.map(async (id) => {
        const driveC = path.join(compat, id, "pfx/drive_c");
        return (await isDir(driveC)) ? driveC : null;
      }));
      prefixes.push(...found.filter(Boolean));
    }
  }
  return [...new Set(prefixes)];
}

//Existing emulator save folders inside Proton prefixes: [{ source, dir }]
async function getEmulatorDirsInPrefixes() {
  const candidates = (await getProtonPrefixes()).flatMap(driveC => EMULATOR_DIRS.map(emu => ({ source: emu.source, dir: path.join(driveC, emu.dir) })));
  const exists = await Promise.all(candidates.map(({ dir }) => isDir(dir)));
  return candidates.filter((_, i) => exists[i]);
}

/*
  Achievement schema without an API key, for games the Steam client has no cache of.
  IPlayerService/GetGameAchievements is the public endpoint the Steam store uses.
*/
//Node https, not fetch(): inside the app window a fetch() is bound by the page's CSP/CORS rules
function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000, headers: { "Accept": "application/json" } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${new URL(url).pathname}`)); }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (err) { reject(err); } });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function fetchSchemaKeyless(appid, lang = "english") {
  const list = (await getJson(`https://api.steampowered.com/IPlayerService/GetGameAchievements/v1/?appid=${appid}&language=${encodeURIComponent(lang)}`))?.response?.achievements || [];
  if (list.length === 0) throw new Error("Schema doesn't have any achievement");

  let name = null;
  try {
    name = (await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`))?.[appid]?.data?.name || null;
  } catch { /* name is optional */ }

  return {
    name: name || `Steam App ${appid}`,
    appid: `${appid}`,
    binary: null,
    img: getRemoteArt(appid),
    achievement: {
      total: list.length,
      list: list.map(a => ({
        name: a.internal_name,
        displayName: a.localized_name,
        description: a.localized_desc || "",
        hidden: a.hidden ? 1 : 0,
        icon: iconURL(appid, a.icon),
        icongray: iconURL(appid, a.icon_gray)
      }))
    }
  };
}

module.exports = {
  findSteamRoots,
  getProtonPrefixes,
  getEmulatorDirsInPrefixes,
  fetchSchemaKeyless,
  getUsers,
  getInstalledApps,
  listStatsApps,
  readSchema,
  readUserStats,
  getAchievements,
  getLocalArt,
  getRemoteArt,
  getPlaytime,
  getRunningAppIds,
  toAccountId,
  toSteamId64
};
