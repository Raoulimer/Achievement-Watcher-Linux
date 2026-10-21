"use strict";

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const ws = require('ws');
const appData = require("./util/appData.js");
const debug = new (require("@xan105/log"))({
  console: true,
  file: path.join(appData,"Achievement Watcher/logs/websocket.log")
});

const test = require("./notification-test.js");

let WebSocket;

/*
  Browsers let any web page open a websocket to localhost, they only tell us who is asking (Origin header).
  Allowed: local clients that send no Origin (OBS, scripts), the Achievement Watcher UI (file://) and local files ("null").
*/
function isAllowedOrigin(origin) {
  return origin === undefined || origin === "null" || origin === "file://";
}

module.exports = (option = {}) => {

  //Default values
  const options = {
    port: Number.isInteger(option.port) ? option.port : 8082,
    host: option.host || "127.0.0.1", //local apps only (OBS overlay, Achievement Watcher UI): never expose it to the LAN
    ipv6Only: option.ipv6Only || false,
    timeout: Number.isInteger(option.timeout) ? option.timeout : 30000, //30sec
    ssl: option.ssl || false,
    auth: option.auth || null //username:password
  };
  
  //Creating a http server by ourself so we can use basic auth http and https with websocket
  let server;
  if (options.ssl) 
  {
    server = https.createServer({
      cert: fs.readFileSync(path.join(__dirname, 'ssl/cert.pem')),
      key: fs.readFileSync(path.join(__dirname, 'ssl/key.pem'))
    });
  } 
  else 
  {
    server = http.createServer();
  }
  //Port taken (another watchdog, another app): run without the websocket instead of crashing the whole watchdog
  server.on('error', (err) => {
    debug.error(`Websocket server error: ${err.message}${err.code === "EADDRINUSE" ? ` > websocket disabled, port ${options.port} is used by another program` : ""}`);
  });
  server.listen({ port: options.port, host: options.host, ipv6Only: options.ipv6Only }); //Start http(s) server
  
  WebSocket = new ws.Server({ noServer: true }); //WebSocket server detached from the http(s) server
  
  debug.log(`Websocket listening on port ${options.port}...`);

  //Handle client authentication in the upgrade event (http->ws) of the http(s) server
  server.on('upgrade', function upgrade(request, socket, head) {

     if (!isAllowedOrigin(request.headers.origin)) {
       debug.warn(`Websocket connection refused from origin "${request.headers.origin}"`);
       socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
       socket.destroy();
       return;
     }

     if (options.auth) //Client authentication
     {
     
      debug.log("Basic http auth is enabled > authenticating ...");
     
      const login = Buffer.from((request.headers.authorization || '').split(' ')[1] || '', 'base64').toString();
      if (!login) debug.warn("Missing Basic http auth header !");

      if (login !== options.auth) {
       
          debug.log("Basic http auth > DENY");
       
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
       }
       debug.log("Basic http auth > ALLOW");
     }

      WebSocket.handleUpgrade(request, socket, head, function done(_ws) { //http->ws upgrade
        WebSocket.emit('connection', _ws, request);
      });
  });
  
  WebSocket.on('connection', (client, req) => {
  
     //client identification
     client.id = req.headers['sec-websocket-key'];
     client.ip = req.connection.remoteAddress;
     debug.log(`[${client.id}](${client.ip}) client connected`);
     
     //heartbeat
     client.isAlive = true;
     client.on('pong', function(){ this.isAlive = true });
     
     client.on('message', incoming);
     client.on('close', function(code, reason){ debug.log(`[${this.id}](${this.ip}) connection close (${code}) ${reason}`) });
     client.on('error', function(err){ debug.error(`[${this.id}](${this.ip}) Error: ${err}`) });
  });
  
  WebSocket.on('error', (err) => debug.error(`Server error: ${err}`));
  
  //heartbeat
  setInterval(() => {
    WebSocket.clients.forEach( (client) => {
      if (client.isAlive === false) {
        debug.log(`[${client.id}](${client.ip}) closing broken connection`);
        return client.terminate();
      }
      client.isAlive = false;
      client.ping(()=>{}); //noop
    });
  }, options.timeout);
  
  return server;
}

module.exports.isAllowedOrigin = isAllowedOrigin;

module.exports.broadcast = broadcast;

function broadcast(message) {
  try {
    if (WebSocket?.clients.size > 0) {
      
      let json = JSON.stringify(message);
      
      WebSocket.clients.forEach( (client) => { 
          try{
            debug.log(`WS[${client.id}] Sending notification`);
            client.send(json);
          }catch(err){
            debug.error(`WS[${client.id}] Error: ${err}`);
          }
      });
    }
   }catch(err){
      debug.error(`Error: ${err}`);
   }
}

function incoming(message){
  try {
     let req;
     try{
       req = JSON.parse(message);
     }catch(err){
       throw new Error(`request is not a valid JSON > ${err}`);
     }

     if (req.cmd === "test") 
     {
        debug.log(`WS[${this.id}] received command 'test'`);
                
        const dummy = {
           appID: 480,
           game: "Spacewar",
           achievement: "ACH_WIN_ONE_GAME",
           displayName: "Winner",
           description: "Win one game.",
           icon: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/480/winner.jpg",
           time: Math.floor(Date.now() / 1000)
        };
                
        if (req.broadcast === true) {
           broadcast(dummy);       
        } else {
           debug.log(`WS[${this.id}] Sending notification`);
           this.send(JSON.stringify(dummy));
        }
     } 
     else if (req.cmd === "toast-test")
     {
        debug.log(`WS[${this.id}] received command 'toast-test'`);

        test.toast()
          .then(() => {
             this.send(JSON.stringify({
                cmd: "toast-test",
                success: true
             }));
          })
          .catch((err) => {
             this.send(JSON.stringify({
                 cmd: "toast-test",
                 success: false,
                 error: `${err}`
             }));
          });
      }
     else if (req.cmd === "gntp-test")
     {
        debug.log(`WS[${this.id}] received command 'gntp-test'`);

        test.gntp()
          .then(() => {
             this.send(JSON.stringify({
                cmd: "gntp-test",
                success: true
             }));
          })
          .catch((err) => {
             this.send(JSON.stringify({
                 cmd: "gntp-test",
                 success: false,
                 error: `${err}`
             }));
          });
      }
      else
      {
        debug.warn(`WS[${this.id}] received unknow command`);
      }
  }catch(err){
    debug.error(`WS[${this.id}] ${err}`);
  }
}