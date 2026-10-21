"use strict"

const fs = require("fs/promises");
const os = require("os");

/*
  Places that can hold games: the home folder and data disks under /media, /mnt, /run/media.
  "/" itself is never returned: a recursive scan of it would walk /proc, /sys and /usr.
*/
const fsTypes = ["ext2", "ext3", "ext4", "btrfs", "xfs", "f2fs", "zfs", "ntfs", "ntfs3", "fuseblk", "exfat", "vfat"];

module.exports = async () => {

    const mounts = (await fs.readFile("/proc/self/mounts", "utf8"))
        .split("\n")
        .map(line => line.split(" "))
        .filter(([, mountpoint, type]) => mountpoint && fsTypes.includes(type))
        .map(([, mountpoint]) => mountpoint.replace(/\\040/g, " "))
        .filter(mountpoint => /^\/(media|mnt|run\/media)\//.test(mountpoint));

    return [...new Set([os.homedir(), ...mounts])];
}
