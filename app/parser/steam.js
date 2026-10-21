"use strict";

const remote = require('@electron/remote');
const path = require("path");
const glob = require("fast-glob");
const normalize = require('normalize-path');
const ini = require("@xan105/ini");
const omit = require('lodash.omit');
const request = require('request-zero');
const ffs = require("@xan105/fs");
const { getConfig } = require('../util/registry');
const steamLocal = require(path.join(appPath,"lib/steam-local"));
const steamLanguages = require(path.join(appPath,"locale/steam.json"));
const sse = require(path.join(appPath,"parser/sse.js"));
const { mydocs } = require(path.join(appPath,"util/userShellFolder.js"));

const cacheRoot = remote.app.getPath('userData');

module.exports.scan = async (additionalSearch = []) => {

    let search = [
        path.join(mydocs, "Steam/CODEX"),
        path.join(process.env['HOME'], ".steam", "Goldberg SteamEmu Saves"),
        path.join(process.env['HOME'], ".local/share", "Goldberg SteamEmu Saves"),
        path.join(process.env['HOME'], ".steam", "EMPRESS"),
        path.join(mydocs, "EMPRESS"),
        path.join(process.env['HOME'], ".steam", "Steam/CODEX"),
        path.join(process.env['HOME'], ".steam", "SKIDROW"),
        path.join(process.env['HOME'], ".steam", "SmartSteamEmu"),
        path.join(process.env['HOME'], ".steam", "CreamAPI")
    ];

    //Emulators running under Proton write inside the game's prefix
    try {
      search = search.concat((await steamLocal.getEmulatorDirsInPrefixes()).map(({ dir }) => dir));
    } catch { /* no Steam */ }

    const userFolders = await getConfig('steam_search_folders.json');
    if (Array.isArray(userFolders)) search = search.concat(userFolders);

    if(additionalSearch.length > 0) search = search.concat(additionalSearch);

    search = search.map((dir) => { return normalize(dir) + "/([0-9]+)" });

    let data = [];
    for (let dir of await glob(search,{onlyDirectories: true, absolute: true, suppressErrors: true})) {

        let game = {
            appid: path.parse(dir).name,
            data: {
              type: "file",
              path: dir }
        };

        if (dir.includes("CODEX")) {
          game.source = "Codex";
        } else if (dir.includes("Goldberg")){
          game.source = "Goldberg";
        } else if (dir.includes("EMPRESS")){
          game.source = "Goldberg (EMPRESS)";
          game.data.path = path.join(game.data.path,"remote",game.appid);
        } else if (dir.includes("SKIDROW")){
          game.source = "Skidrow";
        } else if (dir.includes("SmartSteamEmu")){
          game.source = "SmartSteamEmu";
        } else if (dir.includes("CreamAPI")){
          game.source = "CreamAPI";
        }

        data.push(game);
    }
    return data;
}

/*
  Legit Steam, read straight from the local Steam client (appcache/stats).
  listingType: 1 = installed games only, 2 = every game with local achievement data
*/
module.exports.scanLegit = async (listingType = 0) => {

  if (listingType <= 0) return [];

  const roots = steamLocal.findSteamRoots();
  if (roots.length === 0) throw "Legit Steam not found (looked in ~/.steam, ~/.local/share/Steam, Flatpak and Snap)";

  let data = [];

  for (const root of roots) {
    const installed = await steamLocal.getInstalledApps(root);
    for (const user of await steamLocal.getUsers(root)) {
      for (const appid of await steamLocal.listStatsApps(root, user.accountId)) {
        if (listingType == 1 && !installed.has(appid)) continue;
        data.push({
          appid: appid,
          source: `Steam (${user.name})`,
          data: {
            type: "steamLocal",
            root: root,
            accountId: user.accountId,
            name: installed.get(appid)?.name
          }
        });
      }
    }
  }

  return data;
}

//Game metadata for a legit Steam game, built from the local schema
module.exports.getGameDataFromLocal = async (cfg) => {

  const { gamename, list } = await steamLocal.getAchievements(cfg.root, cfg.accountId, cfg.appID, cfg.lang);
  if (list.length === 0) throw "Schema doesn't have any achievement";

  const local = steamLocal.getLocalArt(cfg.root, cfg.appID);
  const remoteArt = steamLocal.getRemoteArt(cfg.appID);

  const game = {
    name: cfg.name || gamename || `Steam App ${cfg.appID}`,
    appid: cfg.appID,
    binary: null,
    img: {
      header: local.header || remoteArt.header,
      background: local.background || remoteArt.background,
      portrait: local.portrait || remoteArt.portrait,
      icon: local.icon || remoteArt.icon
    },
    achievement: {
      total: list.length,
      list: list.map(({ Achieved, UnlockTime, CurProgress, MaxProgress, ...schema }) => schema)
    }
  };

  //User state, in the same shape the other sources use
  const root = {};
  for (const ach of list) {
    root[ach.name] = {
      Achieved: ach.Achieved ? 1 : 0,
      UnlockTime: ach.UnlockTime,
      CurProgress: ach.CurProgress,
      MaxProgress: ach.MaxProgress
    };
  }

  return { game, root };
}

/*
  Game metadata for Steam emulator sources (appid only).
  Use the local Steam schema when the Steam client has it, otherwise the Steam Web API (needs a key).
*/
module.exports.getGameData = async (cfg) => {
  if (!steamLanguages.some( language => language.api === cfg.lang )) {
        throw "Unsupported API language code";
  }

  for (const root of steamLocal.findSteamRoots()) {
    try {
      const { game } = await module.exports.getGameDataFromLocal({ root, accountId: "0", appID: cfg.appID, lang: cfg.lang });
      return game;
    } catch { /* not in this Steam client cache */ }
  }

  const cache = path.join(cacheRoot,"steam_cache/schema",cfg.lang);

  try {

    let filePath = path.join(`${cache}`,`${cfg.appID}.db`);

    let result;

    if (await ffs.existsAndIsYoungerThan(filePath,{timeUnit: 'M', time: 6})) {
        result = JSON.parse(await ffs.readFile(filePath));
    } else {
        //Public endpoint first (no key), the Steam Web API key only as a last resort
        try {
          result = await steamLocal.fetchSchemaKeyless(cfg.appID, cfg.lang);
        } catch (err) {
          if (!cfg.key) throw `No local Steam schema, keyless lookup failed (${err.message || err}) and no Steam Web API key set`;
          result = await getSteamData(cfg);
        }
        ffs.writeFile(filePath,JSON.stringify(result, null, 2)).catch(() => {});
   }

   return result;

 }catch(err) {
  if (err.code)
    throw `Could not load Steam data: ${err.code} - ${err.message}`;
  else
    throw `Could not load Steam data: ${err}`;
 }
}

module.exports.getAchievementsFromFile = async (filePath) => {

  const files = [
    "achievements.ini",
    "achievements.json",
    "achiev.ini",
    "stats.ini",
    "Achievements.Bin",
    "achieve.dat",
    "Achievements.ini",
    "stats/achievements.ini",
    "stats.bin",
    "stats/CreamAPI.Achievements.cfg"
  ];

  const filter = ["SteamAchievements","Steam64","Steam"];

  let local;
  for (let file of files) {
     try {
       if (path.parse(file).ext == ".json") {
          local = JSON.parse(await ffs.readFile(path.join(filePath,file),"utf8"));
       } else if (file === "stats.bin"){
          local = sse.parse(await ffs.readFile(path.join(filePath,file)));
       } else {
          local = ini.parse(await ffs.readFile(path.join(filePath,file),"utf8"));
       }
       break;
     } catch (e) {}
  }
  if(!local) throw `No achievement file found in '${filePath}'`;

  let result = {};

  if (local.AchievementsUnlockTimes && local.Achievements) { //hoodlum DARKSiDERS
    for (let i in local.Achievements) {
      if(Object.prototype.hasOwnProperty.call(local.Achievements,i)){
        if (local.Achievements[i] == 1) {
          result[`${i}`] = { Achieved: "1", UnlockTime: local.AchievementsUnlockTimes[i] || null };
        }
      }
    }
  } else if (local.State && local.Time ) { //3DM
    for (let i in local.State) {
      if(Object.prototype.hasOwnProperty.call(local.State,i)){
        if(local.State[i] == '0101'){
          result[i] = { Achieved: "1", UnlockTime: new DataView(new Uint8Array(Buffer.from(local.Time[i].toString(),'hex')).buffer).getUint32(0, true) || null };
        }
      }
    }
  } else {
    result = omit(local.ACHIEVE_DATA || local, filter);
  }

  for (let i in result) {
    if(Object.prototype.hasOwnProperty.call(result,i)){
       if(result[i].State) { //RLD!
            try{
              //uint32 little endian
              result[i].State = new DataView(new Uint8Array(Buffer.from(result[i].State.toString(),'hex')).buffer).getUint32(0, true);
              result[i].CurProgress = new DataView(new Uint8Array(Buffer.from(result[i].CurProgress.toString(),'hex')).buffer).getUint32(0, true);
              result[i].MaxProgress = new DataView(new Uint8Array(Buffer.from(result[i].MaxProgress.toString(),'hex')).buffer).getUint32(0, true);
              result[i].Time = new DataView(new Uint8Array(Buffer.from(result[i].Time.toString(),'hex')).buffer).getUint32(0, true);
            }catch(e){}
       } else if (result[i].unlocktime && result[i].unlocktime.length === 7){ //creamAPI
          result[i].unlocktime = +result[i].unlocktime * 1000 //cf: https://cs.rin.ru/forum/viewtopic.php?p=2074273#p2074273 | timestamp is invalid/incomplete
       }
    }
  }

  return result;
}

//Steam users of the local client(s), for the avatar menu
module.exports.getSteamUsers = async () => {
  let result = [];
  for (const root of steamLocal.findSteamRoots()) {
    for (const user of await steamLocal.getUsers(root)) {
      if (!result.some(u => u.accountId === user.accountId)) result.push({ ...user, root });
    }
  }
  if (result.length === 0) throw "No Steam user found";
  return result;
}

async function getSteamData(cfg) {

  const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${cfg.key}&appid=${cfg.appID}&l=${cfg.lang}&format=json`;

  const data = await request.getJson(url);

  const schema = data.game.availableGameStats;
  if (!(schema && schema.achievements && schema.achievements.length > 0)) throw "Schema doesn't have any achievement";

  const art = steamLocal.getRemoteArt(cfg.appID);

  return {
    name: data.game.gameName || `Steam App ${cfg.appID}`,
    appid: cfg.appID,
    binary: null,
    img: art,
    achievement: {
      total: schema.achievements.length,
      list: schema.achievements
    }
  };
}
