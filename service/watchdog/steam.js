"use strict";

const path = require('path');
const fs = require("@xan105/fs");
const request = require('request-zero');
const steamLang = require("./steam.json");
const steamLocal = require("../../app/lib/steam-local");
const appData = require("./util/appData.js");

//Schema from the local Steam client: no network, no key, always the right language
async function loadFromLocalSteam(appID, lang) {
  for (const root of steamLocal.findSteamRoots()) {
    try {
      const schema = await steamLocal.readSchema(root, appID, lang);
      if (schema.achievements.length === 0) continue;
      const installed = await steamLocal.getInstalledApps(root);
      const art = steamLocal.getLocalArt(root, appID);
      const remote = steamLocal.getRemoteArt(appID);
      return {
        name: installed.get(`${appID}`)?.name || schema.gamename || `Steam App ${appID}`,
        appid: `${appID}`,
        binary: null,
        img: {
          header: art.header || remote.header,
          background: art.background || remote.background,
          portrait: art.portrait || remote.portrait,
          icon: art.icon ? require("url").fileURLToPath(art.icon) : null
        },
        achievement: {
          total: schema.achievements.length,
          list: schema.achievements.map(({ statId, bit, progress, ...ach }) => ach)
        }
      };
    } catch { /* not cached by this Steam install */ }
  }
  return null;
}

module.exports.loadSteamData = async (appID, lang, key) => {

  if (!steamLang.some( language => language.api === lang )) {
        throw "Unsupported API language code";
  }
  
  const cache = path.join(appData,"Achievement Watcher/steam_cache/schema",lang);

  try {

    const local = await loadFromLocalSteam(appID, lang);
    if (local) return local;

    let filePath = path.join(`${cache}`,`${appID}.db`);
    let result;

    if (await fs.existsAndIsYoungerThan(filePath,{timeUnit: 'M', time: 6})) {
        result = JSON.parse(await fs.readFile(filePath));
    } else {
        //Public endpoint first (no key), the Steam Web API key only as a last resort
        try {
          result = await steamLocal.fetchSchemaKeyless(appID, lang);
        } catch (err) {
          if (!key) throw `not in the local Steam client cache, keyless lookup failed (${err.message || err}) and no Steam Web API key set`;
          result = await getSteamData(appID, lang, key);
        }
        fs.writeFile(filePath,JSON.stringify(result, null, 2)).catch((err) => { console.log(err) });                 
   }
   
   return result;
   
 }catch(err) {
  throw `Could not load Steam data for ${appID} - ${lang}: ${err}`
 }
 
}

module.exports.fetchIcon = async (url,appID) => {
  try{
  
    const cache = path.join(appData,`Achievement Watcher/steam_cache/icon/${appID}`);

    const filename = path.basename(new URL(url).pathname);

    let filePath = path.join(cache,filename);

    if (await fs.exists(filePath)) {
      return filePath;
    } else {
      return (await request.download(url,cache)).path;
    }

  }catch(err){
    return url;
  }
}

async function getSteamData (appID,lang,key) {
  
  const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${key}&appid=${appID}&l=${lang}&format=json`;

  const data = await request.getJson(url);
  
  const schema = data.game.availableGameStats;
  if (!(schema && schema.achievements && schema.achievements.length > 0)) throw "Schema doesn't have any achievement";

  const result = {
    name: data.game.gameName || `Steam App ${appID}`, 
    appid: appID,
    binary: null,
    img: {
      header: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/header.jpg`,
      background: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/page_bg_generated_v6b.jpg`,
      portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/library_600x900.jpg`,
      icon: null
    },
    achievement: {
      total: schema.achievements.length,
      list: schema.achievements
    }
  };
          
  return result;
}
