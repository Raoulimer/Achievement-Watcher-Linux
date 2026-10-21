"use strict";

/*
  Valve KeyValues readers.
  - Binary KV: appcache/stats/*.bin (UserGameStatsSchema_*, UserGameStats_*)
  - Text VDF: libraryfolders.vdf, loginusers.vdf, localconfig.vdf, appmanifest_*.acf
*/

const TYPE = {
  NONE: 0x00, //nested object
  STRING: 0x01,
  INT32: 0x02,
  FLOAT32: 0x03,
  POINTER: 0x04,
  WSTRING: 0x05,
  COLOR: 0x06,
  UINT64: 0x07,
  END: 0x08,
  INT64: 0x0A,
  END_ALT: 0x0B
};

function parseBinary(buffer) {
  let offset = 0;

  const readCString = () => {
    const end = buffer.indexOf(0x00, offset);
    if (end === -1) throw new Error("Unterminated string in binary KV");
    const str = buffer.toString("utf8", offset, end);
    offset = end + 1;
    return str;
  };

  const readObject = () => {
    const obj = {};
    while (offset < buffer.length) {
      const type = buffer[offset++];
      if (type === TYPE.END || type === TYPE.END_ALT) return obj;
      const key = readCString();
      switch (type) {
        case TYPE.NONE:
          obj[key] = readObject();
          break;
        case TYPE.STRING:
          obj[key] = readCString();
          break;
        case TYPE.INT32:
        case TYPE.POINTER:
        case TYPE.COLOR:
          obj[key] = buffer.readInt32LE(offset);
          offset += 4;
          break;
        case TYPE.FLOAT32:
          obj[key] = buffer.readFloatLE(offset);
          offset += 4;
          break;
        case TYPE.UINT64:
          obj[key] = buffer.readBigUInt64LE(offset).toString();
          offset += 8;
          break;
        case TYPE.INT64:
          obj[key] = buffer.readBigInt64LE(offset).toString();
          offset += 8;
          break;
        case TYPE.WSTRING: {
          const len = buffer.readUInt16LE(offset);
          offset += 2;
          obj[key] = buffer.toString("utf16le", offset, offset + len * 2);
          offset += len * 2;
          break;
        }
        default:
          throw new Error(`Unknown binary KV type 0x${type.toString(16)} at offset ${offset - 1}`);
      }
    }
    return obj;
  };

  return readObject();
}

//Text VDF: "key" "value" pairs and "key" { ... } blocks. Keys are kept as-is (case sensitive).
function parseText(text) {
  const root = {};
  const stack = [root];
  let i = 0;
  let pendingKey = null;

  const readQuoted = () => {
    let out = "";
    i++; //opening quote
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\" && i + 1 < text.length) {
        const next = text[i + 1];
        out += (next === "n") ? "\n" : (next === "t") ? "\t" : next;
        i += 2;
      } else {
        out += text[i++];
      }
    }
    i++; //closing quote
    return out;
  };

  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const token = readQuoted();
      if (pendingKey === null) {
        pendingKey = token;
      } else {
        stack[stack.length - 1][pendingKey] = token;
        pendingKey = null;
      }
    } else if (c === "{") {
      const obj = {};
      if (pendingKey !== null) stack[stack.length - 1][pendingKey] = obj;
      stack.push(obj);
      pendingKey = null;
      i++;
    } else if (c === "}") {
      if (stack.length > 1) stack.pop();
      i++;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else {
      i++;
    }
  }
  return root;
}

//VDF keys are case-insensitive for Steam; look a key up regardless of case
function getKey(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in obj) return obj[key];
  const lower = key.toLowerCase();
  const match = Object.keys(obj).find(k => k.toLowerCase() === lower);
  return match !== undefined ? obj[match] : undefined;
}

module.exports = { parseBinary, parseText, getKey };
