"use strict";

/*
  Emulator achievement files (monitor.parse): the formats the watchdog reads from emulator save folders.
  Run: npm test (in service/watchdog)
*/

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.XDG_CONFIG_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "aw-cfg-")); //keep logs out of the real config
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-parse-"));
const monitor = require("../monitor.js");

const write = (name, content) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
};
const byName = (list, name) => list.find(a => a.name === name);

(async () => {
  //Goldberg / GSE: achievements.json
  let list = await monitor.parse(write("achievements.json", JSON.stringify({
    CH1: { earned: true, earned_time: 1700000000 },
    CH2: { earned: false, earned_time: 0 }
  })));
  assert.strictEqual(list.length, 2);
  assert.deepStrictEqual(byName(list, "CH1"), { name: "CH1", Achieved: true, CurProgress: 0, MaxProgress: 0, UnlockTime: 1700000000 });
  assert.strictEqual(byName(list, "CH2").Achieved, false);
  console.log("ok - goldberg json");

  //CODEX: achievements.ini, [SteamAchievements] index section is not an achievement
  list = await monitor.parse(write("achievements.ini", [
    "[SteamAchievements]", "00000=CH1", "Count=1",
    "[CH1]", "Achieved=1", "CurProgress=0", "MaxProgress=0", "UnlockTime=1700000100",
    "[COLLECT]", "Achieved=0", "CurProgress=20", "MaxProgress=20", "UnlockTime=0",
    "[HALF]", "Achieved=0", "CurProgress=5", "MaxProgress=20", "UnlockTime=0"
  ].join("\n")));
  assert.strictEqual(list.length, 3, "index section skipped");
  assert.strictEqual(byName(list, "CH1").Achieved, true);
  assert.strictEqual(+byName(list, "CH1").UnlockTime, 1700000100);
  assert.strictEqual(byName(list, "COLLECT").Achieved, true, "progress at max counts as unlocked (CODEX Gears 5)");
  assert.strictEqual(byName(list, "HALF").Achieved, false);
  assert.strictEqual(+byName(list, "HALF").CurProgress, 5);
  console.log("ok - codex ini");

  //Most recent unlock first
  assert.strictEqual(list[0].name, "CH1");
  console.log("ok - sorted by unlock time");

  //Hoodlum: [Achievements] + [AchievementsUnlockTimes]
  list = await monitor.parse(write("achieve.ini", [
    "[Achievements]", "CH1=1", "CH2=0",
    "[AchievementsUnlockTimes]", "CH1=1700000200", "CH2=0"
  ].join("\n")));
  assert.strictEqual(list.length, 1, "only unlocked ones are listed");
  assert.strictEqual(byName(list, "CH1").Achieved, true);
  assert.strictEqual(+byName(list, "CH1").UnlockTime, 1700000200);
  console.log("ok - hoodlum ini");

  //Broken file: an error, not a crash of the watchdog
  await assert.rejects(monitor.parse(write("broken.json", "{ not json")));
  console.log("ok - broken file rejects");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("all parse tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
