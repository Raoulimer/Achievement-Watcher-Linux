'use strict';

const path = require('path');
const { getConfig, setConfig } = require('./registry');

const DEFAULT_WAV = "Linux Notify System Generic.wav";
const CONFIG_FILE = "toastAudio.json";

module.exports.getDefault = async () => {
  // On Linux, return a default .wav file name or custom if set
  const config = await getConfig(CONFIG_FILE);
  return config.default || DEFAULT_WAV;
};

module.exports.setCustom = async (filename) => {
  const config = await getConfig(CONFIG_FILE);
  config.custom = filename;
  await setConfig(CONFIG_FILE, config);
};

module.exports.getCustom = async () => {
  const config = await getConfig(CONFIG_FILE);
  return config.custom || "";
};
