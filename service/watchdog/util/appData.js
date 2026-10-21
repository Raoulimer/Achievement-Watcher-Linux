'use strict';

//%APPDATA% on Windows, $XDG_CONFIG_HOME (~/.config) on Linux
const path = require('path');
const os = require('os');

module.exports = process.env['APPDATA'] || process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
