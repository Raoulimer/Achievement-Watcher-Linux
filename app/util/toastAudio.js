'use strict';

/*
  Achievement sound.
  customToastAudio: 0 = silent, 1 = desktop sound theme ("complete"), 2 = one of the bundled sounds (notification_toast.audioFile)
  Shared by the settings UI (preview) and the watchdog (playback).
*/

const fs = require('fs');
const path = require('path');

const SOUNDS_DIR = path.join(__dirname, "../resources/sounds");

//freedesktop sound theme: Yaru (Ubuntu) then the generic theme
const THEME_SOUNDS = [
  "/usr/share/sounds/Yaru/stereo/complete.oga",
  "/usr/share/sounds/freedesktop/stereo/complete.oga"
];

function getDefault() {
  return THEME_SOUNDS.find(file => fs.existsSync(file)) || null;
}

function listBundled() {
  try {
    return fs.readdirSync(SOUNDS_DIR).filter(f => /\.(wav|oga|ogg)$/i.test(f));
  } catch {
    return [];
  }
}

//Absolute path of the sound to play for the given options, or null for silence
function resolve(notificationToastOptions = {}) {
  const mode = +notificationToastOptions.customToastAudio;
  if (mode === 1) return getDefault();
  if (mode === 2) {
    const file = path.basename(notificationToastOptions.audioFile || "");
    const full = path.join(SOUNDS_DIR, file);
    return (file && fs.existsSync(full)) ? full : getDefault();
  }
  return null;
}

module.exports = { SOUNDS_DIR, getDefault, listBundled, resolve };
