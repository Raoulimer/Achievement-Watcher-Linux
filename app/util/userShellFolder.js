'use strict';

const path = require('path');
const fs = require('fs');

// Try to use the XDG user dirs config if it exists, otherwise fallback
function getXdgUserDir(type, fallback) {
  const configFile = path.join(process.env['HOME'], '.config', 'user-dirs.dirs');
  try {
    const content = fs.readFileSync(configFile, 'utf8');
    const match = content.match(new RegExp(`XDG_${type.toUpperCase()}_DIR="?([^"\n]+)"?`));
    if (match && match[1]) {
      return match[1].replace('$HOME', process.env['HOME']);
    }
  } catch {}
  return fallback;
}

const folders = {
  mypictures: getXdgUserDir('pictures', path.join(process.env['HOME'], 'Pictures')),
  myvideo: getXdgUserDir('videos', path.join(process.env['HOME'], 'Videos'))
};

module.exports = folders;
