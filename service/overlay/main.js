'use strict';

/*
  In-game achievement toasts (over fullscreen games): one long-lived process for a whole burst of unlocks.
  Started by the watchdog: electron --ozone-platform=x11 main.js
    stdin:  one JSON card per line { id, title, description, game, icon, header, progress, duration, position }
    stdout: "accepted <id>" as soon as a card is read, "shown <id>" once it is on screen, "failed <id>" if it can't be
  Up to MAX_VISIBLE cards are stacked in one window, the others wait for a free slot.
  The process quits after IDLE_EXIT without any card, the watchdog starts a new one for the next unlock.

  Why X11 (Xwayland): a Wayland client can't choose its position nor stay above a fullscreen window on GNOME.
  An X11 window of type _NET_WM_WINDOW_TYPE_NOTIFICATION goes to mutter's META_LAYER_OVERRIDE_REDIRECT,
  the topmost layer (mutter src/x11/window-x11.c get_standalone_layer), and mutter never gives it focus,
  so the game keeps the keyboard/gamepad and stays fullscreen.
*/

const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const os = require('os');
const readline = require('readline');

const WIDTH = 400;
const CARD_HEIGHT = 104;
const GAP = 10;
const MARGIN = 24;
const MAX_VISIBLE = 3;
const HEIGHT = MAX_VISIBLE * CARD_HEIGHT + (MAX_VISIBLE - 1) * GAP;
const SLIDE_OUT = 600; //ms, the slide-out animation is 500ms
const IDLE_EXIT = 30 * 1000;
const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

//Separate profile: never touch the main app's cache/lock
app.setPath('userData', path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Achievement Watcher', 'overlay'));
app.disableHardwareAcceleration(); //a few 400x104 cards don't need the GPU the game is using

let win = null;
let loaded = null;
let visible = 0;
let idleTimer = null;
let inputClosed = false;
const waiting = [];

const reply = (status, id) => process.stdout.write(`${status} ${id}\n`);

function bounds(position) {
  const { bounds: screenBounds } = screen.getPrimaryDisplay(); //bounds, not workArea: a fullscreen game covers the panel too
  return {
    x: position.endsWith('left') ? screenBounds.x + MARGIN : screenBounds.x + screenBounds.width - WIDTH - MARGIN,
    y: position.startsWith('top') ? screenBounds.y + MARGIN : screenBounds.y + screenBounds.height - HEIGHT - MARGIN,
    width: WIDTH,
    height: HEIGHT
  };
}

function createWindow() {
  win = new BrowserWindow({
    ...bounds('bottom-right'),
    type: 'notification',
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      spellcheck: false,
      backgroundThrottling: false //cards are added while the window is still hidden
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true); //click-through: never interferes with the game
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  loaded = win.loadFile(path.join(__dirname, 'toast.html'));
}

async function display(card) {
  clearTimeout(idleTimer);
  visible++;
  const duration = Math.max(3, Math.min(+card.duration || 12, 120)) * 1000;
  const position = POSITIONS.includes(card.position) ? card.position : 'bottom-right';
  try {
    await loaded;
    win.setBounds(bounds(position));
    if (!win.isVisible()) win.showInactive();
    //Plain data only: toast.js puts every field in the page with textContent
    await win.webContents.executeJavaScript(`addCard(${JSON.stringify({
      title: `${card.title || ''}`,
      description: `${card.description || ''}`,
      game: `${card.game || ''}`,
      icon: `${card.icon || ''}`,
      header: `${card.header || 'Achievement unlocked'}`,
      progress: card.progress ? `${card.progress.current}/${card.progress.max}` : '',
      duration,
      position
    })})`);
    reply('shown', card.id);
  } catch (err) {
    process.stderr.write(`card ${card.id}: ${err}\n`);
    reply('failed', card.id);
    visible--;
    return next();
  }
  setTimeout(() => {
    visible--;
    next();
  }, duration + SLIDE_OUT);
}

function next() {
  while (visible < MAX_VISIBLE && waiting.length > 0) display(waiting.shift());
  if (visible === 0 && waiting.length === 0) {
    win?.hide();
    if (inputClosed) return app.quit();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => app.quit(), IDLE_EXIT);
  }
}

app.whenReady().then(() => {
  createWindow();

  const input = readline.createInterface({ input: process.stdin });
  input.on('line', (line) => {
    let card;
    try {
      card = JSON.parse(line);
    } catch {
      return;
    }
    reply('accepted', card.id);
    waiting.push(card);
    next();
  });
  input.on('close', () => { //the watchdog went away: finish what is on screen then leave
    inputClosed = true;
    if (visible === 0 && waiting.length === 0) app.quit();
  });

  idleTimer = setTimeout(() => app.quit(), IDLE_EXIT);
});

app.on('window-all-closed', () => app.quit());
