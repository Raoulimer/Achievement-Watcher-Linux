'use strict';

/*
  In-game toasts (service/overlay): one Electron process shows a whole burst of unlocks, stacked,
  and quits by itself once idle. The next unlock starts a new one.
  A toast that fails to appear (no Xwayland, Electron missing, overlay crashed...) calls its onFail so the caller can fall back.
*/

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const debug = require("../util/log.js");

const ELECTRON = path.resolve(__dirname, "../../../app/node_modules/electron/dist/electron");
const MAIN = path.resolve(__dirname, "../../overlay/main.js");
const START_TIMEOUT = 10 * 1000; //ms for the overlay to read a toast (includes Electron's startup)

let overlay = null; //{ child, pending: Map(id -> { onFail, timer, accepted }) }
let nextId = 1;

function available() {
    return process.platform === "linux" && !!process.env.DISPLAY && fs.existsSync(ELECTRON) && fs.existsSync(MAIN);
}

function fail(entry, reason) {
    clearTimeout(entry.timer);
    debug.warn(`[Overlay] ${reason}`);
    try { entry.onFail(reason); } catch { /* ignore */ }
}

function start() {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE; //this one must start Chromium

    const child = spawn(ELECTRON, ["--ozone-platform=x11", MAIN], { env, stdio: ["pipe", "pipe", "pipe"] });
    const self = { child, pending: new Map() };
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
        stdout += d;
        const lines = stdout.split("\n");
        stdout = lines.pop();
        for (const line of lines) {
            const [status, id] = line.trim().split(" ");
            const entry = self.pending.get(id);
            if (!entry) continue;
            if (status === "accepted") {
                clearTimeout(entry.timer); //it may now wait for a free slot as long as the cards above it last
            } else if (status === "shown") {
                self.pending.delete(id);
                debug.log("[Overlay] toast shown");
            } else if (status === "failed") {
                self.pending.delete(id);
                fail(entry, "overlay could not show the toast");
            }
        }
    });
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-2000); });
    child.stdin.on("error", () => { /* EPIPE: the exit handler reports it */ });

    const end = (reason) => {
        if (overlay === self) overlay = null;
        for (const entry of self.pending.values()) fail(entry, reason);
        self.pending.clear();
    };
    child.on("error", (err) => end(err.message));
    child.on("exit", (code) => end(`overlay exited with ${code}: ${stderr.split("\n").filter(l => l && !/Frame latency|Vulkan/.test(l)).slice(-3).join(" | ")}`));

    return self;
}

//message: the toaster message ({ achievementName, achievementDisplayName, achievementDescription, gameDisplayName, icon, progress })
function show(message, { duration, position } = {}, onFail = () => {}) {
    if (!available()) {
        onFail("overlay not available (no X display or Electron missing)");
        return;
    }
    if (!overlay || overlay.child.exitCode !== null) overlay = start();

    const id = `${nextId++}`;
    const icon = message.icon && !/^https?:/.test(message.icon) && fs.existsSync(message.icon) ? pathToFileURL(message.icon).href : (message.icon || "");
    const self = overlay;
    const entry = { onFail };
    entry.timer = setTimeout(() => {
        self.pending.delete(id);
        fail(entry, "toast did not appear in time");
    }, START_TIMEOUT);
    self.pending.set(id, entry);

    self.child.stdin.write(JSON.stringify({
        id,
        title: message.achievementDisplayName,
        description: message.achievementDescription,
        game: message.gameDisplayName,
        icon,
        header: message.progress ? "Achievement progress" : (message.achievementName ? "Achievement unlocked" : "Achievement Watcher"),
        progress: message.progress,
        duration,
        position
    }) + "\n");
}

module.exports = { show, available };
