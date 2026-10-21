'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sound = require('../sound.js');
const overlay = require('../overlay.js');
const steamLocal = require('../../../../app/lib/steam-local');
const debug = require("../../util/log.js");

const APP_ICON = path.resolve(__dirname, "../icon/icon.png");
const IN_GAME_DURATION = 12; //s the in-game toast stays up by default

/*
  While a game runs, GNOME holds normal banners back until you leave fullscreen and always shows them top-center.
  So over a game we draw our own toast bottom-right (../overlay.js) and file the desktop notification
  with LOW urgency: GNOME never shows LOW as a banner (messageTray.js _onNotificationRequestBanner),
  it only lands in the notification list, so there is no duplicate.
  If the toast can't be shown we fall back to a CRITICAL banner, the only kind GNOME shows over a fullscreen
  window (messageTray.js _updateState), closed by us after the same duration since GNOME never expires it.
  Nothing is forced over the game when the user turned banners off (Do Not Disturb).
*/
async function bannersAllowed() {
    try {
        const { stdout } = await promisify(execFile)("gsettings", ["get", "org.gnome.desktop.notifications", "show-banners"], { timeout: 2000 });
        return stdout.trim() !== "false";
    } catch {
        return true; //not GNOME / no gsettings
    }
}

async function shouldShowOverGame(options) {
    if (options.inGamePopup === false) return false;
    if ((await steamLocal.getRunningAppIds()).size === 0) return false;
    return await bannersAllowed();
}

function closeNotification(id) {
    execFile("gdbus", ["call", "--session", "--dest", "org.freedesktop.Notifications",
        "--object-path", "/org/freedesktop/Notifications",
        "--method", "org.freedesktop.Notifications.CloseNotification", `${id}`],
        { timeout: 2000 }, (err) => { if (err) debug.warn(`CloseNotification ${id}: ${err.message}`); });
}

/*
  libnotify (org.freedesktop.Notifications) via notify-send: GNOME, KDE, XFCE, Cinnamon, sway (mako/dunst).
  No --action: Ubuntu's AppArmor profile for notify-send denies the GetCapabilities call that actions need
  (notify-send then exits 1). Clicking the notification still opens the app through the desktop-entry hint.
  urgency: "low" (list only), "normal", "critical" (over fullscreen, closed by us after closeAfter seconds)
*/
function desktopNotification(message, urgency = "normal", closeAfter = 0) {
    return new Promise((resolve, reject) => {

        let body = message.achievementDescription || "";
        if (message.progress && message.progress.max > 0) {
            body = `[ ${message.progress.current} / ${message.progress.max} ]${body ? "\n" + body : ""}`;
        }
        if (message.gameDisplayName && message.gameDisplayName !== message.achievementDisplayName) {
            body = body ? `${body}\n${message.gameDisplayName}` : message.gameDisplayName;
        }

        const icon = (message.icon && !/^https?:/.test(message.icon)) ? message.icon : APP_ICON;

        const args = [
            "--app-name=Achievement Watcher",
            `--icon=${icon}`,
            `--urgency=${urgency}`,
            "--print-id",
            "--category=x-achievement-watcher.achievement",
            "--hint=string:desktop-entry:achievement-watcher",
            "--hint=boolean:suppress-sound:true", //we play our own sound
            message.achievementDisplayName || "Achievement unlocked",
            body
        ];

        execFile("notify-send", args, { timeout: 5000 }, (err, stdout, stderr) => {
            if (err) return reject(`notify-send failed: ${(stderr || err.message).trim()}${err.code === "ENOENT" ? " (install libnotify-bin)" : ""}`);
            const id = stdout.trim().split("\n")[0];
            if (closeAfter > 0 && /^\d+$/.test(id)) setTimeout(() => closeNotification(id), closeAfter * 1000);
            resolve(id);
        });
    });
}

module.exports = async (message, options) => {
    sound.play(options.toast).catch((err) => debug.warn(`Sound: ${err}`));

    const duration = +options.toast.inGameDuration || IN_GAME_DURATION;
    if (await shouldShowOverGame(options.toast)) {
        debug.log("Game running: in-game toast (bottom-right) + notification list entry");
        overlay.show(message, { duration, position: options.toast.inGamePosition }, (reason) => {
            debug.warn(`In-game toast failed (${reason}): falling back to a GNOME banner over the game`);
            desktopNotification(message, "critical", duration).catch((err) => debug.error(err));
        });
        await desktopNotification(message, "low");
    } else {
        await desktopNotification(message, "normal");
    }
}
