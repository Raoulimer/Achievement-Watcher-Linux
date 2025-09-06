// Linux replacement for Windows Registry access using JSON files
// Note to self: I need to sanitise these paths to prevent injection

const fs = require('fs/promises');
const path = require('path');
const CONFIG_DIR = path.join(process.env.HOME, '.config', 'achievement-watcher');

async function getConfig(filename) {
  try {
    const file = path.join(CONFIG_DIR, filename);
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    return {};
  }
}

async function setConfig(filename, data) {
  const file = path.join(CONFIG_DIR, filename);
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

module.exports = { getConfig, setConfig, CONFIG_DIR };
