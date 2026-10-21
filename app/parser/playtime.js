'use strict';

const path = require('path');
const { getConfig, setConfig } = require('../util/registry');
const steamLocal = require(path.join(appPath,"lib/steam-local"));

//Steam's own counters (localconfig.vdf) for legit games, the watchdog's tracking for everything else
async function getSteamPlaytime(appID) {
    let best = { playtime: 0, lastplayed: 0 };
    for (const root of steamLocal.findSteamRoots()) {
        for (const user of await steamLocal.getUsers(root)) {
            const entry = (await steamLocal.getPlaytime(root, user.accountId))[appID];
            if (entry && entry.playtime > best.playtime) best = entry;
        }
    }
    return best;
}

module.exports = async (appID) => {
    const playtimeData = await getConfig('playtime.json');
    const tracked = { playtime: +playtimeData[appID]?.total || 0, lastplayed: +playtimeData[appID]?.last || 0 };
    const steam = await getSteamPlaytime(appID).catch(() => ({ playtime: 0, lastplayed: 0 }));
    return {
        playtime: Math.max(tracked.playtime, steam.playtime),
        lastplayed: Math.max(tracked.lastplayed, steam.lastplayed)
    };
}

module.exports.reset = async (appID) => {
    const playtimeData = await getConfig('playtime.json');
    playtimeData[appID] = { total: 0, last: 0 };
    await setConfig('playtime.json', playtimeData);
}
