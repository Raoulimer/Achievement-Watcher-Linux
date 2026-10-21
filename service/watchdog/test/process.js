"use strict";

/*
  Is the game running ? (util/process.isGameRunning) on a fake Steam install with fake game processes.
  Run: npm test (in service/watchdog)
*/

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aw-steam-"));
process.env.STEAM_ROOT = root;
process.env.XDG_CONFIG_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "aw-cfg-")); //keep logs out of the real config
const processes = require("../util/process.js");

const APPID = "999991";
fs.mkdirSync(path.join(root, "steamapps/common/Fake Story Game"), { recursive: true });
fs.writeFileSync(path.join(root, "steamapps", `appmanifest_${APPID}.acf`), `"AppState"\n{\n\t"appid"\t\t"${APPID}"\n\t"name"\t\t"Fake Story Game"\n\t"installdir"\t\t"Fake Story Game"\n}\n`);

//A process whose command line looks like a Proton game started from its install folder
const fakeGame = (args) => spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)", ...args], { stdio: "ignore" });

(async () => {
  assert.strictEqual(await processes.isGameRunning({ appid: APPID }), false, "installed, not running");
  console.log("ok - installed game not running");

  assert.strictEqual(await processes.isGameRunning({ appid: "123" }), null, "unknown game: can't tell");
  console.log("ok - unknown game is undecided");

  let child = fakeGame([`Z:\\${root.replace(/\//g, "\\")}\\steamapps\\common\\Fake Story Game\\Game.exe`]);
  await new Promise(r => setTimeout(r, 300));
  assert.strictEqual(await processes.isGameRunning({ appid: APPID }), true, "process from the install folder");
  child.kill();
  console.log("ok - Proton process from the install folder");

  child = fakeGame(["SteamLaunch", "AppId=123"]);
  await new Promise(r => setTimeout(r, 300));
  assert.strictEqual(await processes.isGameRunning({ appid: "123" }), true, "launched by Steam");
  child.kill();
  console.log("ok - launched by Steam (reaper AppId=)");

  fs.rmSync(root, { recursive: true, force: true });
  console.log("all process tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
