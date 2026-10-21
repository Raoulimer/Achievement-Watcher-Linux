"use strict";

//"Test notification" buttons of the app (Settings > Notification), received over the websocket
const path = require("path");
const toast = require("./notification/transport/toast.js");
const gntp = require("./notification/transport/gntp.js");
const settings = require('./settings.js');

const appData = require("./util/appData.js");
const cfg_file = path.join(appData,"Achievement Watcher/cfg","options.ini");

module.exports.toast = async() => {
  const options = await settings.load(cfg_file);
  await toast({
    appid: 480,
    gameDisplayName: "Achievement Watcher",
    achievementDisplayName: "Achievement Watcher",
    achievementDescription: "Notification test: you should hear the achievement sound and see this message.",
    icon: path.join(__dirname, "notification/icon/icon.png")
  }, {
    toast: {
      customAudio: options.notification_toast.customToastAudio,
      audioFile: options.notification_toast.audioFile,
      inGamePopup: options.notification.inGamePopup,
      inGameDuration: options.notification.inGameDuration,
      inGamePosition: options.notification.inGamePosition
    }
  });
}

module.exports.gntp = async() => {
  const options = await settings.load(cfg_file);
  if (!await gntp.hasGrowl()) throw "GNTP endpoint unreachable!";
  await gntp.send({
    title: "Achievement Watcher",
    message: (options.notification.showDesc) ? "Grrr!\nHello World" : "Grrr!",
    icon: path.join(__dirname, "notification/icon/icon.png")
  });
}
