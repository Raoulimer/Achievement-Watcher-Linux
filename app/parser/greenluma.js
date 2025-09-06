"use strict";

const { getConfig } = require('../util/registry');

module.exports.scan = async () => {
  try {
    // On Linux, simulate the registry keys as JSON
    const greenlumaData = await getConfig('greenluma.json');
    // Structure: { glr: [...], gl2020: [...] }
    let data = [];

    for (const source of ['glr', 'gl2020']) {
      if (greenlumaData[source]) {
        for (const key of greenlumaData[source]) {
          if (key.SkipStatsAndAchievements === 0) {
            data.push({
              appid: key.appid,
              source: source === 'glr' ? "GreenLuma Reborn" : "GreenLuma 2020",
              data: {
                type: "reg",
                root: "HKCU",
                path: `SOFTWARE/${source === 'glr' ? 'GLR' : 'GL2020'}/AppID/${key.appid}/Achievements`
              }
            });
          }
        }
      }
    }
    return data;
  } catch (err) {
    throw err;
  }
};

module.exports.getAchievements = async (root, key) => {
  try {
    // Simulate achievements per app as JSON
    const greenlumaData = await getConfig('greenluma.json');
    const [source, appid] = key.split('/').slice(-2);
    const achievements = greenlumaData[source]?.find(k => k.appid === appid)?.achievements || [];
    return achievements.map(a => ({
      id: a.id,
      Achieved: a.Achieved,
      UnlockTime: a.UnlockTime
    }));
  } catch (err) {
    throw err;
  }
};
