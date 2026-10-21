'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  session,
  shell,
  ipcMain
} = require('electron');
const remote = require('@electron/remote/main');

const path = require("path");
const fs = require("fs");
const ipc = require(path.join(__dirname,"ipc.js"));

//Same folder as the watchdog (~/.config/Achievement Watcher) so both share options.ini and caches
app.setName("Achievement Watcher");
app.setPath("userData", path.join(app.getPath("appData"), "Achievement Watcher"));

remote.initialize();

(function main(){
try {

  //Already running: the first instance gets our argv in 'second-instance' (opens the game). Never build a window here
  if (app.requestSingleInstanceLock() !== true) {
    app.quit();
    return;
  }

  const manifest = require("../package.json");
  const isDev = manifest.config.debug || process.argv.includes("--dev");

  if (manifest.config["disable-gpu"]) app.disableHardwareAcceleration();
  if (manifest.config.appid) app.setAppUserModelId(manifest.config.appid);

  let MainWin = null;

  app.on('ready', function(){

    let options = { ...manifest.config.window };
    options.show = false;
    options.icon = path.join(__dirname, "..", options.icon);
    options.webPreferences = {
        devTools: isDev,
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
        webviewTag: false,
        spellcheck: false,
        v8CacheOptions: (isDev) ? "none" : "code"
    };

    try{
      fs.accessSync(options.icon, fs.constants.F_OK);
    }catch{
      delete options.icon;
    }

    MainWin = new BrowserWindow(options);
    remote.enable(MainWin.webContents);

    //Frameless
    if (options.frame === false) MainWin.isFrameless = true;

    //Debug tool
    if (isDev) {
      MainWin.webContents.openDevTools({mode: "undocked"});
      MainWin.isDev = true;
      console.info((({node,electron,chrome })=>({node,electron,chrome}))(process.versions));
      try {
        require('electron-context-menu')({
			append: (defaultActions, params, browserWindow) => [
				{
					label: 'Reload', visible: params, click: () => { MainWin.reload() }
				}
			]
        });
      }catch(err){
        console.warn(`Failed to initialize context menu: ${err}`);
      }
    }

    //User agent
    MainWin.webContents.userAgent = manifest.config["user-agent"];
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = manifest.config["user-agent"];
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    //External links open in the default browser, never inside the app
    const isExternal = (url) => /^https?:\/\//i.test(url);
    MainWin.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith("file://")) {
        event.preventDefault();
        if (isExternal(url)) shell.openExternal(url).catch(()=>{});
      }
    });
    MainWin.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternal(url)) shell.openExternal(url).catch(()=>{});
      return { action: "deny" };
    });

    //enable ipc
    ipc.window(MainWin);

    MainWin.loadFile(path.join(__dirname, "..", manifest.config.window.view)).catch(err => {
      dialog.showErrorBox("Load Error", `Failed to load window view:\n${err}`);
    });

    const isReady = [
		new Promise(function(resolve) {
			MainWin.once('ready-to-show', () => { return resolve() }); //Window is loaded and ready to be drawn
		}),
		new Promise(function(resolve) {
			ipcMain.handleOnce('components-loaded', () => { return resolve() }); //Wait for custom event
		})
    ];

    Promise.all(isReady).then(() => {
        MainWin.show();
		MainWin.focus();
	});

    MainWin.on('closed', () => {
      MainWin = null
    });

  })
  .on('window-all-closed', function() {
      app.quit();
  })
  .on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
   })
   .on('second-instance', (event, argv, cwd) => {
    if (MainWin) {
      if (MainWin.isMinimized()) MainWin.restore();
      MainWin.focus();
    }
  });

}catch(err) {
  dialog.showErrorBox("Critical Error", `Failed to initialize:\n${err}`);
  app.quit();
}
})();
