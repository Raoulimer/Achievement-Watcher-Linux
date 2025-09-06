'use strict';

const { getConfig, setConfig } = require('../util/registry');

module.exports = async (appID) => {
    const playtimeData = await getConfig('playtime.json');
    const current = +playtimeData[appID]?.total || 0;
    const last = +playtimeData[appID]?.last || 0;
    return { playtime: current, lastplayed: last };
}

module.exports.reset = async (appID) => {
    const playtimeData = await getConfig('playtime.json');
    playtimeData[appID] = { total: 0, last: 0 };
    await setConfig('playtime.json', playtimeData);
}
