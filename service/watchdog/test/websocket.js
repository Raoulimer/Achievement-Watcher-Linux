"use strict";

/*
  Websocket server: a taken port must not crash the watchdog, web pages must not get in.
  Run: npm test (in service/watchdog)
*/

const assert = require("assert");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

process.env.XDG_CONFIG_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "aw-cfg-")); //keep logs out of the real config
const WebSocket = require("ws");
const websocket = require("../websocket.js");

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer().listen(0, "127.0.0.1", () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

//Resolves "open" or the connection error
const connect = (port, origin) => new Promise((resolve) => {
  const client = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { headers: { Origin: origin } } : {});
  client.on("open", () => resolve({ status: "open", client }));
  client.on("error", (err) => resolve({ status: err.message }));
});

(async () => {
  //Port already taken
  const blocker = net.createServer();
  const takenPort = await freePort();
  await new Promise(r => blocker.listen(takenPort, "127.0.0.1", r));
  const failed = websocket({ port: takenPort, timeout: 60000 });
  await new Promise(r => failed.once("error", r));
  await new Promise(r => setTimeout(r, 100));
  console.log("ok - port in use does not crash");
  blocker.close();

  const port = await freePort();
  const server = websocket({ port, timeout: 60000 });
  await new Promise(r => server.once("listening", r));

  for (const origin of ["https://evil.example", "http://localhost:3000"]) {
    const res = await connect(port, origin);
    assert.match(res.status, /403/, `${origin} must be refused`);
  }
  console.log("ok - web page origins are refused");

  for (const origin of [undefined, "null", "file://"]) {
    const res = await connect(port, origin);
    assert.strictEqual(res.status, "open", `${origin} must be accepted`);
    res.client.close();
  }
  console.log("ok - local clients and the app are accepted");

  //"test" command, answered to the sender and broadcast to everyone
  const { client } = await connect(port);
  const reply = new Promise(r => client.once("message", (data) => r(JSON.parse(data))));
  client.send(JSON.stringify({ cmd: "test" }));
  assert.strictEqual((await reply).achievement, "ACH_WIN_ONE_GAME");
  const broadcast = new Promise(r => client.once("message", (data) => r(JSON.parse(data))));
  client.send(JSON.stringify({ cmd: "test", broadcast: true }));
  assert.strictEqual((await broadcast).game, "Spacewar");
  client.close();
  console.log("ok - test command and broadcast");

  console.log("all websocket tests passed");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
