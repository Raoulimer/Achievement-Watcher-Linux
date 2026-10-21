'use strict';

//Achievement icons are downloaded once to ~/.config/Achievement Watcher/steam_cache/icon/<appid>/ (notify-send needs a local file)
module.exports = require("../steam.js").fetchIcon;
