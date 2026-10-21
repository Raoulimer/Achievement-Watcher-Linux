'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

//XDG user dirs (~/.config/user-dirs.dirs), localized folder names included
function getXdgUserDir(type, fallback) {
  const configFile = path.join(process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config'), 'user-dirs.dirs');
  try {
    const content = fs.readFileSync(configFile, 'utf8');
    const match = content.match(new RegExp(`^XDG_${type.toUpperCase()}_DIR="?([^"\n]+)"?`, 'm'));
    if (match && match[1]) {
      return match[1].replace('$HOME', os.homedir());
    }
  } catch {}
  return fallback;
}

const folders = {
  mydocs: getXdgUserDir('documents', path.join(os.homedir(), 'Documents')),
  mypictures: getXdgUserDir('pictures', path.join(os.homedir(), 'Pictures')),
  myvideo: getXdgUserDir('videos', path.join(os.homedir(), 'Videos'))
};

module.exports = folders;
