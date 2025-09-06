'use strict';

const fs = require('fs');
const path = require('path');

async function imageFileToBase64(filePath){
  const ext = path.parse(filePath).ext.replace(".","");
  const buffer = await fs.promises.readFile(filePath);
  const base64 = `data:image/${ext};charset=utf-8;base64,${buffer.toString('base64')}`;
  return base64;
}

async function getLinuxProfileAvatar(){
  // Try standard Linux avatar location
  const avatarPath = path.join(process.env['HOME'], '.face');
  try {
    await fs.promises.access(avatarPath, fs.constants.R_OK);
    return await imageFileToBase64(avatarPath);
  } catch {
    return null;
  }
}

async function getAvatar(){
  let avatar;
  try {
    avatar = localStorage.getItem("avatar");
  } catch {}
  if(!avatar) avatar = await getLinuxProfileAvatar();
  return avatar;
}

module.exports = { getAvatar, imageFileToBase64 };
