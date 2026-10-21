"use strict";

const remote = require('@electron/remote');
const path = require("path");
const ffs = require("@xan105/fs");
const debug = new (require("@xan105/log"))({
  console: remote.getCurrentWindow().isDev || false,
  file: path.join(remote.app.getPath('userData'),"logs/blacklist.log")
});

const file = path.join(remote.app.getPath('userData'),"cfg/exclusion.db");

module.exports.get = async () => {

  //The remote bogus-appid list (api.xan105.com) is gone: keep the well-known ones locally
  let exclude = [
      480, //Space War
      753, //Steam Config
      250820, //SteamVR
      228980, //Steamworks Common Redistributables
      1070560, //Steam Linux Runtime 1.0 (scout)
      1391110, //Steam Linux Runtime 2.0 (soldier)
      1628350, //Steam Linux Runtime 3.0 (sniper)
      1493710 //Proton Experimental
  ];

 try{
      let userExclusion = JSON.parse(await ffs.readFile(file,"utf8")); 
      exclude = [...new Set([...exclude,...userExclusion])];
 }catch(err){
      //Do nothing
 }
 
 return exclude;

}

module.exports.reset = async() => {
    await ffs.writeFile(file,JSON.stringify([], null, 2),"utf8"); 
}

module.exports.add = async (appid) => {
    try{
        
        debug.log(`Blacklisting ${appid} ...`);
        
        let userExclusion;
        
        try{
          userExclusion = JSON.parse(await ffs.readFile(file,"utf8"));
        }catch(e){
          userExclusion = [];
        } 
        
        if (!userExclusion.includes(appid)) {
          userExclusion.push(appid);
          await ffs.writeFile(file,JSON.stringify(userExclusion, null, 2),"utf8"); 
          debug.log("Done.");
        } else {
          debug.log("Already blacklisted.");
        }
  
    }catch(err){
        throw err;
    }
}