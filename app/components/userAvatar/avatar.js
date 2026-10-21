'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

async function imageFileToBase64(filePath){
	const ext = path.parse(filePath).ext.replace(".","") || "png";
	const buffer = await fs.promises.readFile(filePath);
	const base64 = `data:image/${ext};charset=utf-8;base64,${buffer.toString('base64')}`;
	return base64;
}

//The picture set in GNOME/KDE user settings (AccountsService), or the classic ~/.face
async function getLinuxProfileAvatar(){
	const candidates = [
		path.join("/var/lib/AccountsService/icons", os.userInfo().username),
		path.join(os.homedir(), ".face"),
		path.join(os.homedir(), ".face.icon")
	];
	for (const file of candidates) {
		try {
			const buffer = await fs.promises.readFile(file);
			return `data:image/png;charset=utf-8;base64,${buffer.toString('base64')}`; //Chromium sniffs the real type
		} catch { /* next */ }
	}
	throw "No profile picture found";
}

async function getAvatar(){
	let avatar = localStorage.getItem("avatar");
	if(!avatar) avatar = await getLinuxProfileAvatar();
    return avatar;
}

module.exports = { getAvatar, imageFileToBase64 }
