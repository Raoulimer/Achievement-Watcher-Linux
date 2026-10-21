"use strict";

const instance = new (require('single-instance'))('Achievement Watchdog');
const { spawn } = require("child_process");
const path = require('path');
const watch = require('node-watch');
const processes = require('./util/process.js');
const websocket = require("./websocket.js");
const fs = require("@xan105/fs");
const settings = require('./settings.js');
const monitor = require('./monitor.js');
const steam = require("./steam.js");
const track = require("./track.js");
const legitSteam = require("./legit.js");
const humanizeDuration = require("humanize-duration");
const notify = require("./notification/toaster.js");
const debug = require("./util/log.js");
const { crc32 } = require('crc');

const appData = require("./util/appData.js");
const cfg_file = {
  option: path.join(appData,"Achievement Watcher/cfg","options.ini"),
  userDir: path.join(appData,"Achievement Watcher/cfg","userdir.db")
}

const now = () => Math.floor(Date.now() / 1000);

var app = {
  cache : [],
  options : {},
  watcher: [],
  ticks: new Map(), //achievement file -> last time it was processed (spamming protection)
  unknownRunning: new Set(), //appids we can't tell are running (warned once)
  start: async function() {
   try{
     let self = this;
     self.cache = [];

     debug.log("Achievement Watchdog starting ...");

     debug.log("Loading Options ...");
     self.options = await settings.load(cfg_file.option);
     debug.log(self.options);
     debug.log("[Toast] will use libnotify (notify-send)");

     try {
        self.watcher[0] = watch(cfg_file.option, function(evt, name) {
              if (evt === "update") {
                debug.log("option file change detected -> reloading");
                self.watcher.forEach( (watcher) => watcher.close() );
                self.watcher = [];
                self.start();
              }
        });
     }catch(err){
        debug.warn("No option file > settings live reloading disabled");
     }

     if (self.options.achievement_source?.legitSteam != 0) {
        legitSteam.start({
          getOptions: () => self.options,
          notify: (message, kind) => notify(message, self.notifyOptions(kind)),
          onSession: (event, appid, session) => self.onSession(event, appid, session)
        }).catch((err) => debug.error(err));
     } else {
        legitSteam.stop();
        debug.log("Legit Steam source is disabled");
     }

     self.watchedDirs = new Set();
     await self.watchFolders();

     //A game launched for the first time creates its emulator folder (in its Proton prefix) then: pick it up
     clearInterval(self.rescanTimer);
     self.rescanTimer = setInterval(() => self.watchFolders().catch((err) => debug.error(err)), 30 * 1000);

    }catch(err){
      debug.error(err);
      instance.unlock();
      process.exit();
    }
  },
  watchFolders: async function () {
     const self = this;
     for (let folder of await monitor.getFolders(cfg_file.userDir)) {
        try{
          if (!self.watchedDirs.has(folder.dir) && await fs.exists(folder.dir)) {
            self.watchedDirs.add(folder.dir);
            self.watch(self.watcher.length || 1, folder.dir, folder.options);
          }
        }catch(err){
          debug.log(err);
        }
     }
  },
  isRunning: async function (game, options) {
    const self = this;
    if (options.disableCheckIfProcessIsRunning === true || !self.options.notification_advanced.checkIfProcessIsRunning) return true;
    const running = await processes.isGameRunning(game).catch((err) => {
      debug.error(err);
      return null;
    });
    if (running !== null) return running;
    if (!self.unknownRunning.has(game.appid)) {
      self.unknownRunning.add(game.appid);
      debug.warn(`"${game.name}" (${game.appid}) is not a Steam install and its binary name is unknown > can't check if it is running, assuming it is`);
    }
    return true;
  },
  watch: function (i, dir, options) {
    let self = this;
    debug.log(`Monitoring ach change in "${dir}" ...`);

    self.watcher[i] = watch(dir, {recursive: options.recursive, filter: options.filter}, async function(evt, name) {
      try{

        if (evt !== "update") return;

        const currentTime = Date.now();
        const fileLastModified = (await fs.stats(name)).mtimeMs || 0;
        if ( (currentTime - fileLastModified) > 1000) return;

        let filePath = path.parse(name);
        if (!options.file.some(file => file == filePath.base)) return;

        debug.log("achievement file change detected");

        //Per file: an emulator may write the same file several times for one unlock, other games must not be skipped
        if (currentTime - (self.ticks.get(name) || 0) <= self.options.notification_advanced.tick) throw "Spamming protection is enabled > SKIPPING";
        self.ticks.set(name, currentTime);

        let appID;
        try{
          appID = (options.appid) ? options.appid : filePath.dir.replace(/([\\/]stats$)|([\\/]SteamEmu$)|([\\/]SteamEmu[\\/]UserStats$)/g,"").match(/([0-9]+$)/g)[0];
        }catch(err){
          throw "Unable to find game's appID";
        }

        let game = await self.load(appID);

        if (!await self.isRunning(game, options)) {
          debug.warn(`"${game.name}" (${game.appid}) is not running > SKIPPING`);
          return;
        }

        let achievements = await monitor.parse(name);
        if (achievements.length === 0) return;

        let cache = await track.load(appID);

        let j = 0;
        for (let i in achievements) {
          if(Object.prototype.hasOwnProperty.call(achievements,i)){
            try{

                let ach = game.achievement.list.find( (achievement ) => {
                      if (achievements[i].crc) {
                        return achievements[i].crc.includes(crc32(achievement.name).toString(16)); //(SSE) crc module removes leading 0 when dealing with anything below 0x1000 -.-'
                      } else {
                        return achievement.name == achievements[i].name || achievement.name.toUpperCase() == achievements[i].name.toUpperCase() //uppercase == uppercase : cdx xcom chimera (apiname doesn't match case with steam schema)
                      }
                });
                if (!ach) throw "ACH_NOT_FOUND_IN_SCHEMA";

                if(achievements[i].crc) {
                  achievements[i].name = ach.name;
                  delete achievements[i].crc;
                }

                let previous = cache.find(achievement => achievement.name === ach.name) || {
                     Achieved : false,
                     CurProgress : 0,
                     MaxProgress : 0,
                     UnlockTime : 0
                };

                if (!previous.Achieved && achievements[i].Achieved) {

                  if (!achievements[i].UnlockTime || achievements[i].UnlockTime == 0) achievements[i].UnlockTime = now();
                  let elapsedTime = now() - achievements[i].UnlockTime;
                  if (options.disableCheckTimestamp || (elapsedTime >= 0 && elapsedTime <= self.options.notification_advanced.timeTreshold)) {

                    debug.log("Unlocked:"+ ach.displayName);
                    self.runAction(appID, game, ach, achievements[i].UnlockTime);

                    await notify({
                      appid: game.appid,
                      gameDisplayName: game.name,
                      achievementName: ach.name,
                      achievementDisplayName: ach.displayName,
                      achievementDescription: ach.description,
                      icon: ach.icon,
                      time: achievements[i].UnlockTime,
                      delay: j
                    }, self.notifyOptions("unlock"));

                    j+=1;
                  } else {
                    debug.warn("Outatime:"+ ach.displayName)
                  }
                } else if (previous.Achieved && achievements[i].Achieved){

                  debug.log("Already unlocked:"+ ach.displayName);
                  if (previous.UnlockTime > 0 && previous.UnlockTime != achievements[i].UnlockTime) achievements[i].UnlockTime = previous.UnlockTime;

                } else if (!achievements[i].Achieved && achievements[i].MaxProgress > 0 && +previous.CurProgress < +achievements[i].CurProgress ) {

                  debug.log("Progress update:"+ ach.displayName);

                  await notify({
                    appid: game.appid,
                    gameDisplayName: game.name,
                    achievementName: ach.name,
                    achievementDisplayName: ach.displayName,
                    achievementDescription: ach.description,
                    icon: ach.icongray,
                    progress: {
                      current: achievements[i].CurProgress,
                      max: achievements[i].MaxProgress
                    }
                  }, self.notifyOptions("progress"));
                }

            }catch(err){
               if(err === "ACH_NOT_FOUND_IN_SCHEMA") {
                 debug.warn(`${(achievements[i].crc) ? `${achievements[i].crc} (CRC32)` : `${achievements[i].name}`} not found in game schema data ?! ... Achievement was probably deleted or renamed over time > SKIPPING`);
               }else {
                 debug.error(`Unexpected Error for achievement "${achievements[i].name}": ${err}`);
               }
            }
          }
        }
        await track.save(appID,achievements);

      }catch(err){
        debug.warn(err);
      }
    });
  },
  //User's "run on unlock" program (Settings > Advanced), with the achievement in its environment
  runAction: async function(appID, game, ach, time){
    const self = this;
    try{
      if (!self.options.action.target) return debug.log("No action set");
      debug.log(`Action: ${self.options.action.target}`);
      if (!await fs.exists(self.options.action.target)) return debug.warn("Action target missing");
      const exec = spawn(self.options.action.target, { cwd: self.options.action.cwd || path.parse(self.options.action.target).dir, stdio: "ignore", detached: true,
        env : { ...process.env,
          AW_APPID: appID.toString(),
          AW_GAME: game.name.toString(),
          AW_ACHIEVEMENT: ach.name.toString(),
          AW_DISPLAYNAME: ach.displayName.toString(),
          AW_DESCRIPTION: ach.description?.toString() || "",
          AW_ICON: ach.icon?.toString() || "",
          AW_TIME: time.toString()
        }
      });
      exec.on("error", (err) => debug.error(`Action failed: ${err}`));
      exec.unref();
    }catch(err){
      debug.error(`Action failed: ${err}`);
    }
  },
  //kind: "unlock" | "progress" | "session"
  notifyOptions: function(kind = "unlock"){
    const self = this;
    return {
      notify: self.options.notification.notify,
      transport: {
        toast: self.options.notification_transport.toast,
        gntp: self.options.notification_transport.gntp,
        websocket: (kind === "session") ? false : self.options.notification_transport.websocket
      },
      toast: {
        customAudio: (kind === "unlock") ? self.options.notification_toast.customToastAudio : 0,
        audioFile: self.options.notification_toast.audioFile,
        inGamePopup: self.options.notification.inGamePopup,
        inGameDuration: self.options.notification.inGameDuration,
        inGamePosition: self.options.notification.inGamePosition
      },
      gntpLabel: (kind === "session") ? "Playtime" : undefined,
      prefetch: self.options.notification_advanced.iconPrefetch
    };
  },
  onSession: async function(event, appid, session){
    const self = this;
    debug.log(`[Steam] session ${event}: ${appid}`);
    if (!self.options.notification?.playtime || event !== "stop" || session.duration < 60) return;
    try {
      const game = await self.load(appid);
      const played = humanizeDuration(session.duration * 1000, { units: ["h", "m"], round: true });
      const parts = [`Played ${played}`];
      if (session.unlockedThisSession > 0) parts.push(`${session.unlockedThisSession} new achievement${session.unlockedThisSession > 1 ? "s" : ""}`);
      await notify({
        appid,
        gameDisplayName: game.name,
        achievementDisplayName: game.name,
        achievementDescription: parts.join(" · "),
        icon: game.img?.icon || null
      }, self.notifyOptions("session"));
    } catch(err) {
      debug.error(err);
    }
  },
  load : async function(appID){
    let self = this;

    debug.log(`loading steam schema for ${appID}`);

    let game = self.cache.find(game => game.appid == appID);
    if (game) {
      debug.log("from memory cache");
    } else {
      game = await steam.loadSteamData(appID,self.options.achievement.lang,self.options.steam.apiKey);
      self.cache.push(game);
      debug.log("from file cache or remote");
    }
    return game;
  }
}

instance.lock().then(() => {
  app.start().catch(()=>{});
  websocket();
})
.catch((err) => {
  debug.error(err);
  process.exit();
});
