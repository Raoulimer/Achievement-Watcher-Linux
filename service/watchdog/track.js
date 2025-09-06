'use strict';

const { getConfig, setConfig } = require('../../../app/util/registry');

module.exports = async (appID, time) => {
    const playtimeData = await getConfig('playtime.json');
    const current = +playtimeData[appID]?.total || 0;
    playtimeData[appID] = {
        total: current + time,
        last: Math.floor(Date.now() / 1000)
    };
    await setConfig('playtime.json', playtimeData);
};
