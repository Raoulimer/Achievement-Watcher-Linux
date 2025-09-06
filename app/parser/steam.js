"use strict";

const remote = require('@electron/remote');
const path = require("path");
const glob = require("fast-glob");
const normalize = require('normalize-path');
const ini = require("@xan105/ini");
const omit = require('lodash.omit');
const moment = require('moment');
const request = require('request-zero');
const urlParser = require('url');
const ffs = require("@xan105/fs");
const { getConfig } = require('../util/registry');
const steamID = require(path.join(appPath,"util/steamID.js"));
const steamLanguages = require(path.join(appPath,"locale/steam.json"));
const sse = require(path.join(appPath,"parser/sse.js"));
const htmlParser = require("node-html-parser");

const cacheRoot = remote.app.getPath('userData');

module.exports.scan = async (additionalSearch = []) => {
  try {

    let search = [
        path.join(process.env['HOME'], "Documents/Steam/CODEX"), 
        path.join(process.env['HOME'], ".steam", "Goldberg SteamEmu Saves"),
        path.join(process.env['HOME'], ".steam", "EMPRESS"),
        path.join(process.env['HOME'], "Documents/EMPRESS"),
        path.join(process.env['HOME'], ".steam", "Steam/CODEX"),
        path.join(process.env['HOME'], ".steam", "SKIDROW"),
        path.join(process.env['HOME'], ".steam", "SmartSteamEmu"),
        path.join(process.env['HOME'], ".steam", "CreamAPI")
    ];

    // Example: allow user to customize search folders via config
    const userFolders = await getConfig('steam_search_folders.json');
    if (userFolders && Array.isArray(userFolders)) {
      search = search.concat(userFolders);
    }

    if(additionalSearch.length > 0) search = search.concat(additionalSearch);

    search = search.map((dir) => { return normalize(dir) + "/([0-9]+)" });

    let data = [];
    for (let dir of await glob(search,{onlyDirectories: true, absolute: true})) {
    
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
                } else if (dir.includes("ProgramData/Steam")){
                  game.source = "Reloaded - 3DM";
                } else if (dir.includes("CreamAPI")){
                  game.source = "CreamAPI";
                }

                data.push(game);
    };    
    return data;
  
  }catch(err){
      throw err;
  }
}

module.exports.scanLegit = async (listingType = 0) => {
  try {
    let data = [];
    // On Linux, just return an empty array or implement your own logic
    return data;
  } catch(err){
    throw err;
  }
};
