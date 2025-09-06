"use strict";

const path = require('path');
const ini = require("@xan105/ini");
const parentFind = require('find-up');
const omit = require('lodash.omit');
const fs = require("@xan105/fs");
const { getConfig } = require('../../../app/util/registry');
const sse = require("./sse.js");

const files = {
  achievement: [
    "achievements.ini",
    "achievements.json",
    "achiev.ini",
    "stats.ini",
    "Achievements.Bin",
    "achieve.dat",
    "Achievements.ini",
    "stats.bin" 
  ],
  steamEmu: ["ALI213.ini", "valve.ini", "hlm.ini", "ds.ini", "steam_api.ini", "SteamConfig.ini"]
};

module.exports.getFolders = async (userDir_file) => {

  let steamEmu = [
    { 
      dir: path.join(process.env['HOME'], "Documents/Steam/CODEX"), 
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] } 
    },
    { 
      dir: path.join(process.env['HOME'], ".steam", "Steam/CODEX"), 
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] } 
    },
    { 
      dir: path.join(process.env['HOME'], ".steam", "Goldberg SteamEmu Saves"), 
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[1],files.achievement[0]] }
    },
    { 
      dir: path.join(process.env['HOME'], ".steam", "EMPRESS"), 
      options: { recursive: true, filter: /([0-9]+)\\/remote\\/([0-9]+)/, file: [files.achievement[1]] }
    },
    { 
      dir: path.join(process.env['HOME'], "Documents/EMPRESS"), 
      options: { recursive: true, filter: /([0-9]+)\\/remote\\/([0-9]+)/, file: [files.achievement[1]] }
    },
    { 
      dir: path.join(process.env['HOME'], ".steam", "SKIDROW"), 
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[5]] }
    },
    { 
      dir: path.join(process.env['HOME'], ".steam", "SmartSteamEmu"), 
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[7]] }
    }
  ];

  // Optionally, let user add folders in config
  const userFolders = await getConfig('steam_search_folders.json');
  if (userFolders && Array.isArray(userFolders)) {
    userFolders.forEach(dir => {
      steamEmu.push({ dir, options: { recursive: true, filter: /([0-9]+)/, file: files.achievement } });
    });
  }

  return steamEmu;
};
