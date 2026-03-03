'use strict';

const os = require('os');
let regedit;
if (os.platform() === 'win32') {
    try {
        regedit = require('regodit');
    } catch(e) {}
}

module.exports = async (appID,time) => {
    if (!regedit) return;
    const current = +await regedit.promises.RegQueryIntegerValue("HKCU","Software/Achievement Watcher/Playtime/Steam/" + appID,"total") || 0;
    await regedit.promises.RegWriteDwordValue("HKCU","Software/Achievement Watcher/Playtime/Steam/" + appID,"total",current + time);
    
    const last = Math.floor( Date.now() / 1000 );
    await regedit.promises.RegWriteDwordValue("HKCU","Software/Achievement Watcher/Playtime/Steam/" + appID,"last",last);
}