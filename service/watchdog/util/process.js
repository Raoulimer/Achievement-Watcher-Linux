'use strict';

const fs = require('fs/promises');
const path = require('path');
const steamLocal = require('../../../app/lib/steam-local');

const INSTALLED_TTL = 60 * 1000; //ms
let installed = { at: 0, apps: new Map() };

//Command lines of every process: [argv0 file name, whole command line with "/" separators], lowercase
async function commandLines() {
  const list = [];
  const pids = (await fs.readdir("/proc")).filter(p => /^\d+$/.test(p));
  await Promise.all(pids.map(async (pid) => {
    try {
      const cmdline = (await fs.readFile(`/proc/${pid}/cmdline`, "utf8")).toLowerCase().replace(/\\/g, "/");
      list.push([cmdline.split("\0")[0].split("/").pop(), cmdline]);
    } catch { /* process exited */ }
  }));
  return list;
}

async function installDir(appid) {
  if (Date.now() - installed.at > INSTALLED_TTL) {
    const apps = new Map();
    for (const root of steamLocal.findSteamRoots()) {
      for (const [id, app] of await steamLocal.getInstalledApps(root).catch(() => new Map())) apps.set(id, app);
    }
    installed = { at: Date.now(), apps };
  }
  return installed.apps.get(`${appid}`)?.installdir || null;
}

//Is a process with this executable name running ? Matches native binaries and Wine/Proton "Z:\...\Game.exe" command lines
module.exports.isProcessRunning = async (binary) => {
  const wanted = binary.toLowerCase();
  return (await commandLines()).some(([argv0]) => argv0 === wanted);
};

/*
  Is this game running ? null when there is no way to tell (not launched by Steam, binary and install folder unknown).
  - Steam starts every game through "reaper SteamLaunch AppId=<appid>"
  - its executable name, when known (+ the "-Win64-Shipping" Unreal Engine variant)
  - any process started from its Steam install folder (Proton games run as "Z:\...\common\<game>\game.exe")
*/
module.exports.isGameRunning = async ({ appid, binary }) => {
  if ((await steamLocal.getRunningAppIds()).has(`${appid}`)) return true;

  const dir = await installDir(appid);
  if (!binary && !dir) return null;

  const names = binary ? [binary.toLowerCase(), binary.toLowerCase().replace(".exe", "-win64-shipping.exe")] : [];
  const folder = dir ? `/steamapps/common/${path.basename(dir).toLowerCase()}/` : null;
  return (await commandLines()).some(([argv0, cmdline]) => names.includes(argv0) || (folder && cmdline.includes(folder)));
};
