"use strict";

/*
  Real-time notification for legit Steam games (native and Proton), straight from the Steam client:
  Steam rewrites appcache/stats/UserGameStats_<accountId>_<appid>.bin when the game unlocks an achievement.
  We keep the last known unlock bits per file and notify for the bits that flip while the watchdog runs.
*/

const fs = require("fs");
const path = require("path");
const steamLocal = require("../../app/lib/steam-local");
const debug = require("./util/log.js");

const FILE_RE = /^UserGameStats_(\d+)_(\d+)\.bin$/;
const DEBOUNCE = 400; //ms, Steam may write the file in several steps
const SYNC_WINDOW = 15 * 60; //s, older unlock times come from a cloud sync (other PC, offline play) not from playing now
const SESSION_POLL = 10 * 1000; //ms
const PROGRESS_STEPS = [25, 50, 75]; //notify progress when crossing these percentages

const state = new Map(); //file -> { unlocked: Set("statId:bit"), stats: { statId: data } }
const schemaCache = new Map(); //root:appid:lang -> { mtimeMs, schema }
const watchers = [];
let installed = new Map();
let sessionTimer = null;
//appid -> { start, unlockedAtStart }. Module level: an options reload restarts the watcher, not the play sessions
const sessions = new Map();

//"statId:bit" of every unlocked achievement. Only achievement bitfields count: plain stats (kills, letters...) share the same file
function unlockedSet(stats, schema) {
  const set = new Set();
  for (const ach of schema.achievements) {
    const stat = stats[ach.statId];
    if (stat && ((stat.data >>> ach.bit) & 1) === 1) set.add(`${ach.statId}:${ach.bit}`);
  }
  return set;
}

async function readStats(root, accountId, appid) {
  try {
    return await steamLocal.readUserStats(root, accountId, appid);
  } catch {
    await new Promise(r => setTimeout(r, 300)); //caught mid-write: retry once
    return await steamLocal.readUserStats(root, accountId, appid);
  }
}

async function getSchema(root, appid, lang) {
  const key = `${root}:${appid}:${lang}`;
  const file = path.join(root, "appcache/stats", `UserGameStatsSchema_${appid}.bin`);
  const { mtimeMs } = await fs.promises.stat(file);
  const cached = schemaCache.get(key);
  if (cached && cached.mtimeMs === mtimeMs) return cached.schema;
  const schema = await steamLocal.readSchema(root, appid, lang);
  schemaCache.set(key, { mtimeMs, schema });
  return schema;
}

async function gameName(root, appid, schema) {
  if (!installed.has(appid)) installed = await steamLocal.getInstalledApps(root).catch(() => installed);
  return installed.get(appid)?.name || schema.gamename || `Steam App ${appid}`;
}

async function snapshot(root, dir) {
  for (const file of await fs.promises.readdir(dir).catch(() => [])) {
    const match = file.match(FILE_RE);
    if (!match) continue;
    try {
      const stats = await steamLocal.readUserStats(root, match[1], match[2]);
      const schema = await getSchema(root, match[2], "english");
      state.set(path.join(dir, file), { unlocked: unlockedSet(stats, schema), stats: Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, s.data])) });
    } catch (err) {
      debug.warn(`[Steam] Could not read ${file}: ${err}`);
    }
  }
}

async function onChange(root, dir, file, ctx) {
  const match = file.match(FILE_RE);
  if (!match) return;
  const [, accountId, appid] = match;
  const full = path.join(dir, file);

  const options = ctx.getOptions();
  const lang = options.achievement?.lang || "english";
  const schema = await getSchema(root, appid, lang);

  const stats = await readStats(root, accountId, appid);
  const now = Math.floor(Date.now() / 1000);
  const unlocked = unlockedSet(stats, schema);
  const values = Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, s.data]));
  const previous = state.get(full);
  state.set(full, { unlocked, stats: values });

  if (!previous) {
    debug.log(`[Steam] Now tracking ${appid} (${unlocked.size} unlocked)`);
    if (unlocked.size === 0) return;
  }

  const name = await gameName(root, appid, schema);
  const fresh = [...unlocked].filter(key => !previous?.unlocked.has(key));

  let delay = 0;
  for (const key of fresh) {
    const [statId, bit] = key.split(":");
    const ach = schema.achievements.find(a => a.statId === statId && a.bit === +bit);
    const time = stats[statId]?.times?.[bit] || now;
    if (now - time > SYNC_WINDOW) {
      debug.log(`[Steam] ${name}: "${ach.displayName}" synced from Steam Cloud (unlocked ${new Date(time * 1000).toISOString()}) > no notification`);
      continue;
    }
    debug.log(`[Steam] Unlocked: ${name} - ${ach.displayName}`);
    const total = schema.achievements.length;
    const count = schema.achievements.filter(a => unlocked.has(`${a.statId}:${a.bit}`)).length;
    await ctx.notify({
      appid,
      gameDisplayName: name,
      achievementName: ach.name,
      achievementDisplayName: ach.displayName,
      achievementDescription: ach.description,
      icon: ach.icon,
      time,
      delay: delay++,
      counter: { count, total }
    }, "unlock");
  }

  //Progress (achievements bound to a stat: "Collect 50 items" ...)
  if (!options.notification?.notifyOnProgress || !previous) return;
  for (const ach of schema.achievements) {
    if (!ach.progress || ach.progress.max <= 0 || unlocked.has(`${ach.statId}:${ach.bit}`)) continue;
    const statId = schema.statNames[ach.progress.stat];
    if (!statId) continue;
    const before = Math.min(+previous.stats[statId] || 0, ach.progress.max);
    const after = Math.min(+values[statId] || 0, ach.progress.max);
    if (after <= before) continue;
    const crossed = PROGRESS_STEPS.filter(step => before * 100 / ach.progress.max < step && after * 100 / ach.progress.max >= step);
    if (crossed.length === 0) continue;
    debug.log(`[Steam] Progress: ${name} - ${ach.displayName} ${after}/${ach.progress.max}`);
    await ctx.notify({
      appid,
      gameDisplayName: name,
      achievementName: ach.name,
      achievementDisplayName: ach.displayName,
      achievementDescription: ach.description,
      icon: ach.icongray,
      progress: { current: after, max: ach.progress.max }
    }, "progress");
  }
}

function watchDir(root, dir, ctx) {
  const timers = new Map();
  const watcher = fs.watch(dir, { persistent: true }, (event, file) => {
    if (!file || !FILE_RE.test(file)) return;
    clearTimeout(timers.get(file));
    timers.set(file, setTimeout(() => {
      timers.delete(file);
      onChange(root, dir, file, ctx).catch(err => debug.error(`[Steam] ${file}: ${err}`));
    }, DEBOUNCE));
  });
  watcher.on("error", (err) => debug.error(`[Steam] watcher error on ${dir}: ${err}`));
  watchers.push(watcher);
  debug.log(`[Steam] Monitoring "${dir}"`);
}

/*
  Play sessions: a game is running while Steam's "reaper SteamLaunch AppId=<id>" process exists.
  On exit we can tell how long you played and how many achievements you got this session.
*/
function watchSessions(ctx) {
  const countUnlocked = (appid) => {
    let count = 0;
    for (const [file, s] of state) if (file.endsWith(`_${appid}.bin`)) count = Math.max(count, s.unlocked.size);
    return count;
  };

  const tick = async () => {
    const running = await steamLocal.getRunningAppIds();
    for (const appid of running) {
      if (!sessions.has(appid)) {
        sessions.set(appid, { start: Date.now(), unlockedAtStart: countUnlocked(appid) });
        ctx.onSession?.("start", appid, sessions.get(appid));
      }
    }
    for (const [appid, session] of sessions) {
      if (!running.has(appid)) {
        sessions.delete(appid);
        session.duration = Math.round((Date.now() - session.start) / 1000);
        session.unlockedThisSession = countUnlocked(appid) - session.unlockedAtStart;
        ctx.onSession?.("stop", appid, session);
      }
    }
  };

  sessionTimer = setInterval(() => tick().catch(err => debug.error(`[Steam] session: ${err}`)), SESSION_POLL);
  tick().catch(() => {});
  return sessions;
}

module.exports.isRunning = async (appid) => (await steamLocal.getRunningAppIds()).has(`${appid}`);

module.exports.start = async (ctx) => {
  module.exports.stop();
  const roots = steamLocal.findSteamRoots();
  if (roots.length === 0) {
    debug.warn("[Steam] No Steam client found (~/.steam, ~/.local/share/Steam, Flatpak, Snap)");
    return;
  }
  for (const root of roots) {
    const dir = path.join(root, "appcache/stats");
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      installed = new Map([...installed, ...await steamLocal.getInstalledApps(root)]);
      await snapshot(root, dir);
      watchDir(root, dir, ctx);
    } catch (err) {
      debug.error(`[Steam] Cannot monitor ${dir}: ${err}`);
    }
  }
  watchSessions(ctx);
  debug.log(`[Steam] Tracking ${state.size} game(s)`);
};

module.exports.stop = () => {
  while (watchers.length) watchers.pop().close();
  clearInterval(sessionTimer);
  sessionTimer = null;
};
