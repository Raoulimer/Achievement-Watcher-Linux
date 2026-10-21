'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const toastAudio = require('../../../app/util/toastAudio.js');

//PipeWire first (Ubuntu >= 22.10 default), then PulseAudio, then libcanberra
const PLAYERS = [
    { bin: "pw-play", args: (file) => [file] },
    { bin: "paplay", args: (file) => [file] },
    { bin: "canberra-gtk-play", args: (file) => ["-f", file] }
];

function findPlayer() {
    for (const player of PLAYERS) {
        for (const dir of (process.env.PATH || "/usr/bin:/bin").split(":")) {
            if (fs.existsSync(path.join(dir, player.bin))) return player;
        }
    }
    return null;
}

const player = findPlayer();

//toastOptions: { customAudio: 0|1|2, audioFile }
module.exports.play = (toastOptions = {}) => {
    return new Promise((resolve, reject) => {
        const file = toastAudio.resolve({ customToastAudio: toastOptions.customAudio, audioFile: toastOptions.audioFile });
        if (!file) return resolve(); //silent
        if (!player) return reject("No audio player found (pw-play, paplay or canberra-gtk-play)");
        const child = spawn(player.bin, player.args(file), { stdio: "ignore", detached: true });
        child.on("error", (err) => reject(err.message));
        child.on("spawn", () => { child.unref(); resolve(); });
    });
};
