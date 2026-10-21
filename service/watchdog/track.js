"use strict";

//Last known achievement state per game, to tell a new unlock from an old one
const path = require('path');
const fs = require("@xan105/fs");
const appData = require("./util/appData.js");

const cache = path.join(appData,"Achievement Watcher/steam_cache/data");

module.exports.load = async (appID) => {
  try{
    return JSON.parse(await fs.readFile(path.join(cache,`${appID}.db`),"utf8"));
  }catch(err){
    return [];
  }
}

module.exports.save = async (appID,achievements) => {
    await fs.writeFile(path.join(cache,`${appID}.db`),JSON.stringify(achievements, null, null),"utf8");
}
