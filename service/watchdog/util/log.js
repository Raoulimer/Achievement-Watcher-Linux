'use strict';

const path = require('path');
const appData = require("./appData.js");
const debug = new (require("@xan105/log"))({
  console: true,
  file: path.join(appData,"Achievement Watcher/logs/notification.log")
});

module.exports = debug;
