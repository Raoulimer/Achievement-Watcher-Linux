"use strict";

const path = require('path');
const ini = require("@xan105/ini");
const parentFind = require('find-up');
const omit = require('lodash.omit');
const fs = require("@xan105/fs");
const { getConfig } = require('../../app/util/registry');
const sse = require("./sse.js");
const { mydocs } = require("../../app/util/userShellFolder.js");
const steamLocal = require("../../app/lib/steam-local");

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
      options: { recursive: true, filter: /([0-9]+)\/remote\/([0-9]+)/, file: [files.achievement[1]] }
    },
    { 
      dir: path.join(process.env['HOME'], "Documents/EMPRESS"), 
      options: { recursive: true, filter: /([0-9]+)\/remote\/([0-9]+)/, file: [files.achievement[1]] }
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

  //Same emulators running under Proton: their folders are inside each game's prefix
  const watchOptions = {
    CODEX: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] },
    Goldberg: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[1], files.achievement[0]] },
    EMPRESS: { recursive: true, filter: /([0-9]+)\/remote\/([0-9]+)/, file: [files.achievement[1]] },
    SKIDROW: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[5]] },
    SmartSteamEmu: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[7]] }
  };
  try {
    for (const { source, dir } of await steamLocal.getEmulatorDirsInPrefixes()) {
      if (watchOptions[source]) steamEmu.push({ dir, options: watchOptions[source] });
    }
  } catch { /* no Steam / no prefix */ }

  // Optionally, let user add folders in config
  const userFolders = await getConfig('steam_search_folders.json');
  if (userFolders && Array.isArray(userFolders)) {
    userFolders.forEach(dir => {
      steamEmu.push({ dir, options: { recursive: true, filter: /([0-9]+)/, file: files.achievement } });
    });
  }

  //Folders added by the user in the app (Settings > Folders) with the notification bell on
  try{
    let list = JSON.parse(await fs.readFile(userDir_file,"utf8"));
    for (let dir of list) {
      if (dir.notify == true) {
        try{
        
            let info;
            for (var file of files.steamEmu) {
                  try{
                    info = ini.parse(await fs.readFile(path.join(dir.path,file),"utf8"));
                    break;
                  }catch(e){}
            }
            if(info) {

                  if ( (file === files.steamEmu[0] || file === files.steamEmu[1] || file === files.steamEmu[5]) && info.Settings) { //ALI213
                     if(info.Settings.AppID && info.Settings.PlayerName && info.Settings.SaveType == 0) {
                     
                          let dirpath = await parentFind(async (directory) => {
                                            let has = await parentFind.exists(path.join(directory, `Profile/${info.Settings.PlayerName}/Stats`));
                                            return has && directory;
                             }, {cwd: dir.path, type: 'directory'});

                       if (dirpath) steamEmu.push({ dir: path.join(dirpath,`Profile/${info.Settings.PlayerName}/Stats`), options: { appid: info.Settings.AppID, recursive: false, file: [files.achievement[4]]} });  
                  
                     } else if (info.Settings.AppID && info.Settings.PlayerName && info.Settings.SaveType == 1){
                     
                       if (mydocs) steamEmu.push({ dir: path.join(mydocs,`VALVE/${info.Settings.AppID}/${info.Settings.PlayerName}/Stats`), options: { appid: info.Settings.AppID, recursive: false, file: [files.achievement[4]]} });
                        
                     } else if (info.Settings.AppID && !info.Settings.SaveType){
                     
                          let dirpath = await parentFind(async (directory) => {
                                            let has = await parentFind.exists(path.join(directory, "Profile/Stats"));
                                            return has && directory;
                             }, {cwd: dir.path, type: 'directory'});

                       if (dirpath) steamEmu.push({ dir: path.join(dirpath,"Profile/Stats"), options: { appid: info.Settings.AppID, recursive: false, file: [files.achievement[4]]} });
                       
                     }
                      
                  } else if ( (file === files.steamEmu[3] || file === files.steamEmu[2] || file === files.steamEmu[4] ) && info.GameSettings) { //Hoodlum - DARKSiDERS - Skidrow(since end of 2019 ?)
                  
                  
                      if(info.GameSettings.UserDataFolder === "." && info.GameSettings.AppId) {

                          let dirpath = await parentFind(async (directory) => {
                                          let has = await parentFind.exists(path.join(directory, 'SteamEmu/UserStats'));
                                          return has && directory;
                                    }, {cwd: dir.path, type: 'directory'});

                          if (dirpath) {
                            steamEmu.push({ dir: path.join(dirpath,"SteamEmu/UserStats"), options: { appid: info.GameSettings.AppId, recursive: false, file: [files.achievement[2]]} });
                          } else {
   
                            dirpath = await parentFind(async (directory) => {
                                            let has = await parentFind.exists(path.join(directory, 'SteamEmu'));
                                            return has && directory;
                                      }, {cwd: dir.path, type: 'directory'});

                            if (dirpath) {
                              steamEmu.push({ dir: path.join(dirpath,"SteamEmu"), options: { appid: info.GameSettings.AppId, recursive: false, file: [files.achievement[3]]} });
                            } else if(file === files.steamEmu[2] ){
                              //Hoodlum using ALI213 like emu (before ~ september 2019 ?)
                              //User reported that setting it to mydocs has no effect. But should be double confirmed.
                              //Seems to be using defaults: playerName VALVE and saveType 0
                              //Write ach data only on game exit ?
                              
                              dirpath = await parentFind(async (directory) => {
                                            let has = await parentFind.exists(path.join(directory, "Profile/VALVE/Stats"));
                                            return has && directory;
                                        }, {cwd: dir.path, type: 'directory'});
                                        
                              if (dirpath) {
                                steamEmu.push({ 
                                  dir: path.join(dirpath,"Profile/VALVE/Stats"), 
                                  options: { appid: info.GameSettings.AppId, disableCheckIfProcessIsRunning: true, disableCheckTimestamp: true, recursive: false, file: [files.achievement[4]]} 
                                });
                              }
                              
                            }
                          
                          }

                      } else if (info.GameSettings.UserDataFolder === "mydocs" && info.GameSettings.AppId && info.GameSettings.UserName && info.GameSettings.UserName !== ""){
        
                          if (mydocs) {

                            let dirpath = path.join(mydocs,info.GameSettings.UserName,info.GameSettings.AppId,"SteamEmu");
                            
                            if (await fs.exists(path.join(dirpath,"UserStats/achiev.ini"))) {
                              steamEmu.push({ dir: path.join(dirpath,"UserStats"), options: { appid: info.GameSettings.AppId, recursive: false, file: [files.achievement[2]]} });
                            } else {
                              steamEmu.push({ dir: dirpath, options: { appid: info.GameSettings.AppId, recursive: false, file: [files.achievement[3]]} });
                            }
                          }
                     }
                     
                      
                  } else if (file === files.steamEmu[4] && info.Settings) { //Catherine
                      if (info.Settings.AppId && info.Settings.SteamID) {

                          let dirpath = await parentFind(async (directory) => {
                                              let has = await parentFind.exists(path.join(directory, `SteamProfile/${info.Settings.SteamID}`));
                                              return has && directory;
                                    }, {cwd: dir.path, type: 'directory'});

                          if (dirpath) steamEmu.push({ dir: path.join(dirpath,`SteamProfile/${info.Settings.SteamID}`), options: { appid: info.Settings.AppId, recursive: false, file: [files.achievement[6]]} }); 
                      
                      }

                  }
             } else {
                steamEmu.push({ dir: dir.path, options: {recursive: true, filter: /([0-9]+)/, file: files.achievement} }); 
             }
        
        }catch(err){
          /*Do nothing*/
        }
      }
    }
  }catch(err){
    /*Do nothing*/
  }

  return steamEmu;
};

module.exports.parse = async (filePath) => {
    try {
    
      const filter = ["SteamAchievements","Steam64","Steam"];
      
      let local;
      let file = path.parse(filePath);
      if (file.ext == ".json") {
        local = JSON.parse(await fs.readFile(filePath,"utf8"));
      } else if (file.base == "stats.bin"){
        local = sse.parse(await fs.readFile(filePath));
      } else {
        local = ini.parse(await fs.readFile(filePath,"utf8"));
      }
      
      if (local.AchievementsUnlockTimes && local.Achievements) { //hoodlum
        let convert = {};
        for (let i in local.Achievements) {
          if(Object.prototype.hasOwnProperty.call(local.Achievements,i)){
            if (local.Achievements[i] == 1) {
              convert[`${i}`] = { Achieved: "1", UnlockTime: local.AchievementsUnlockTimes[i] || null };
            }
          }
        }
        local = convert;
      } else if (local.State && local.Time) { //3DM
        let convert = {};
        for (let i in local.State) {
          if(Object.prototype.hasOwnProperty.call(local.State,i)){
            if (local.State[i] == "0101") {
              convert[`${i}`] = { Achieved: "1", UnlockTime: new DataView(new Uint8Array(Buffer.from(local.Time[i].toString(),'hex')).buffer).getUint32(0, true) || null };
            }
          }
        }
        local = convert;
      } else {
        local = omit(local.ACHIEVE_DATA || local, filter);
      }
      
      let achievements = [];

      for (let achievement in local){
        if(Object.prototype.hasOwnProperty.call(local,achievement)){
                try {
                  
                  if(local[achievement].State) { //RLD!
                              //uint32 little endian
                              local[achievement].State = new DataView(new Uint8Array(Buffer.from(local[achievement].State.toString(),'hex')).buffer).getUint32(0, true);
                              local[achievement].CurProgress = new DataView(new Uint8Array(Buffer.from(local[achievement].CurProgress.toString(),'hex')).buffer).getUint32(0, true);
                              local[achievement].MaxProgress = new DataView(new Uint8Array(Buffer.from(local[achievement].MaxProgress.toString(),'hex')).buffer).getUint32(0, true); 
                              local[achievement].Time = new DataView(new Uint8Array(Buffer.from(local[achievement].Time.toString(),'hex')).buffer).getUint32(0, true);  
                  }                  

                  let result = {
                      name: local[achievement].id || local[achievement].apiname || local[achievement].name || achievement,
                      Achieved : (local[achievement].Achieved == 1 || local[achievement].achieved == 1 || local[achievement].State == 1 || local[achievement].HaveAchieved == 1 || local[achievement].Unlocked == 1 || local[achievement].earned || local[achievement] === "1") ? true : false,
                      CurProgress : local[achievement].CurProgress || local[achievement].progress || 0,
                      MaxProgress : local[achievement].MaxProgress || local[achievement].max_progress || 0,
                      UnlockTime : local[achievement].UnlockTime || local[achievement].unlocktime || local[achievement].HaveAchievedTime || local[achievement].HaveHaveAchievedTime || local[achievement].Time || local[achievement].earned_time || 0
                  };
                  
                  if (!result.Achieved && result.MaxProgress != 0 && result.CurProgress != 0 && result.MaxProgress == result.CurProgress) { //CODEX Gears5 (09/2019)  && Gears tactics (05/2020)
                      result.Achieved = true;
                  }

                  if(local[achievement].crc) {
                    result.crc = local[achievement].crc;
                  }
                  
                  achievements.push(result);
                }catch(e){}
        }
      }

      achievements.sort((a,b) => {
        return b.UnlockTime - a.UnlockTime;
      });
      
      return achievements;
      
    }catch(err) {
      throw err;
    }
}

