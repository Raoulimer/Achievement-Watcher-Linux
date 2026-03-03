'use strict';

const path = require('path');
const os = require('os');
let regedit;

if (os.platform() === 'win32') {
  try {
    regedit = require('regodit');
  } catch(e) {}
}

const folders = {
	mypictures : (regedit && regedit.RegQueryStringValueAndExpand("HKCU","Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders","My Pictures")) || path.join(process.env['USERPROFILE'] || process.env['HOME'],"Pictures"),
	myvideo : (regedit && regedit.RegQueryStringValueAndExpand("HKCU","Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders","My Video")) || path.join(process.env['USERPROFILE'] || process.env['HOME'],"Videos")
};

module.exports = folders;