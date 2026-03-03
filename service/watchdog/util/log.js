'use strict';

const path = require('path');
const appData = process.env['APPDATA'] || (process.platform == 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.config'));
const debug = new (require("@xan105/log"))({
  console: true,
  file: path.join(appData,"Achievement Watcher/logs/notification.log")
});

module.exports = debug;