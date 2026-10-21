"use strict";

/*
  Integration test for legit Steam unlock detection, on a fake Steam install (nothing real is touched, no desktop notification).
  Run: npm test (in service/watchdog)
*/

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aw-steam-"));
process.env.STEAM_ROOT = root;
process.env.XDG_CONFIG_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "aw-cfg-")); //keep logs out of the real config

const kv = require("../../../app/lib/steam-local/kv.js");
const steamLocal = require("../../../app/lib/steam-local");
const legit = require("../legit.js");

//Minimal binary KV writer (the reader's inverse) to build Steam files
function writeBinary(obj) {
  const parts = [];
  const cstr = (s) => Buffer.concat([Buffer.from(String(s), "utf8"), Buffer.from([0])]);
  const walk = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "object") { parts.push(Buffer.from([0x00]), cstr(k)); walk(v); parts.push(Buffer.from([0x08])); }
      else if (typeof v === "number") { const b = Buffer.alloc(4); b.writeInt32LE(v | 0); parts.push(Buffer.from([0x02]), cstr(k), b); }
      else { parts.push(Buffer.from([0x01]), cstr(k), cstr(v)); }
    }
  };
  walk(obj);
  parts.push(Buffer.from([0x08]));
  return Buffer.concat(parts);
}

const APPID = "999990";
const ACCOUNT = "12345";
const stats = path.join(root, "appcache/stats");
fs.mkdirSync(stats, { recursive: true });
fs.mkdirSync(path.join(root, "steamapps"), { recursive: true });
fs.writeFileSync(path.join(root, "steamapps", `appmanifest_${APPID}.acf`), `"AppState"\n{\n\t"appid"\t\t"${APPID}"\n\t"name"\t\t"Test Story Game"\n\t"installdir"\t\t"Test"\n}\n`);

const ach = (name, title, desc, hidden = 0) => ({ name, display: { name: { english: title, french: `${title} (fr)` }, desc: { english: desc }, hidden, icon: `${name}.jpg`, icon_gray: `${name}_gray.jpg` } });
fs.writeFileSync(path.join(stats, `UserGameStatsSchema_${APPID}.bin`), writeBinary({
  [APPID]: {
    gamename: "Test Story Game",
    stats: {
      "1": { type: "ACHIEVEMENTS", bits: { "0": ach("CH1", "Chapter 1", "Finish chapter 1"), "1": ach("CH2", "Chapter 2", "Finish chapter 2"), "2": ach("SECRET", "Secret ending", "Spoiler", 1) } },
      "2": { type: "ACHIEVEMENTS", bits: { "0": { ...ach("COLLECT", "Collector", "Find 20 letters"), progress: { min_val: 0, max_val: 20, value: { operation: "statvalue", operand1: "letters" } } } } },
      "3": { type: "INT", name: "letters" }
    }
  }
}));

const userFile = path.join(stats, `UserGameStats_${ACCOUNT}_${APPID}.bin`);
const writeUser = (bits1, times1, letters) => {
  const tmp = userFile + ".tmp";
  fs.writeFileSync(tmp, writeBinary({ cache: { crc: 0, PendingChanges: 0, "1": { data: bits1, AchievementTimes: times1 }, "3": { data: letters } } }));
  fs.renameSync(tmp, userFile); //atomic replace, like Steam
};

const now = () => Math.floor(Date.now() / 1000);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  //Reader
  writeUser(0b001, { "0": now() - 3600 }, 3);
  const read = await steamLocal.getAchievements(root, ACCOUNT, APPID, "french");
  assert.strictEqual(read.list.length, 4);
  assert.strictEqual(read.list.find(a => a.name === "CH1").displayName, "Chapter 1 (fr)", "per-language display name");
  assert.strictEqual(read.list.find(a => a.name === "CH2").displayName, "Chapter 2 (fr)");
  assert.strictEqual(read.list.find(a => a.name === "SECRET").hidden, 1);
  assert.strictEqual(read.list.find(a => a.name === "CH1").Achieved, true);
  assert.strictEqual(read.list.find(a => a.name === "CH2").Achieved, false);
  assert.deepStrictEqual([read.list.find(a => a.name === "COLLECT").CurProgress, read.list.find(a => a.name === "COLLECT").MaxProgress], [3, 20]);
  assert.strictEqual(kv.parseText('"a"\n{\n "B" "1" // c\n}').a.B, "1", "text vdf");
  console.log("ok - reader");

  //Watcher
  const sent = [];
  await legit.start({
    getOptions: () => ({ achievement: { lang: "english" }, notification: { notifyOnProgress: true } }),
    notify: async (message, kind) => { sent.push({ kind, message }); }
  });

  writeUser(0b011, { "0": now() - 3600, "1": now() }, 3); //CH2 unlocked just now
  await wait(1200);
  assert.strictEqual(sent.length, 1, "one notification for the new unlock");
  assert.strictEqual(sent[0].kind, "unlock");
  assert.strictEqual(sent[0].message.achievementDisplayName, "Chapter 2");
  assert.strictEqual(sent[0].message.gameDisplayName, "Test Story Game");
  assert.deepStrictEqual(sent[0].message.counter, { count: 2, total: 4 });
  assert.ok(sent[0].message.icon.endsWith(`/apps/${APPID}/CH2.jpg`));
  console.log("ok - new unlock is notified");

  writeUser(0b011, { "0": now() - 3600, "1": now() }, 3); //rewrite, nothing new
  await wait(1200);
  assert.strictEqual(sent.length, 1, "no duplicate on rewrite");
  console.log("ok - rewrite without change is silent");

  writeUser(0b111, { "0": now() - 3600, "1": now(), "2": now() - 86400 }, 3); //SECRET came from a cloud sync (yesterday)
  await wait(1200);
  assert.strictEqual(sent.length, 1, "cloud sync is not notified");
  console.log("ok - Steam Cloud sync is silent");

  writeUser(0b111, { "0": now() - 3600, "1": now(), "2": now() - 86400 }, 10); //3/20 -> 10/20 crosses 25% and 50%
  await wait(1200);
  assert.strictEqual(sent.length, 2, "progress milestone");
  assert.strictEqual(sent[1].kind, "progress");
  assert.deepStrictEqual(sent[1].message.progress, { current: 10, max: 20 });
  writeUser(0b111, { "0": now() - 3600, "1": now(), "2": now() - 86400 }, 11);
  await wait(1200);
  assert.strictEqual(sent.length, 2, "no progress spam between milestones");
  console.log("ok - progress milestones");

  //Options reload (legit.start again) while a game runs: same session, no second "start"
  const game = require("child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)", "SteamLaunch", `AppId=${APPID}`], { stdio: "ignore" });
  await wait(300);
  const sessions = [];
  const ctx = { getOptions: () => ({}), notify: async () => {}, onSession: (event, appid, session) => sessions.push({ event, appid, start: session.start }) };
  await legit.start(ctx);
  await wait(300);
  await legit.start(ctx);
  await wait(300);
  game.kill();
  assert.deepStrictEqual(sessions.map(s => `${s.event}:${s.appid}`), [`start:${APPID}`], "one session across the reload");
  console.log("ok - options reload keeps the play session");

  legit.stop();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("all tests passed");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  legit.stop();
  process.exit(1);
});
