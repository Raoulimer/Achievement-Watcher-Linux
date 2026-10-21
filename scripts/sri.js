"use strict";

/*
  Refresh the Subresource Integrity hashes in app/view/app.html.
  Every <script src> / <link href> there is pinned by sha384: after editing one of those files run `npm run sri` (in app/).
*/

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const view = path.join(__dirname, "../app/view/app.html");
const html = fs.readFileSync(view, "utf8");

let changed = 0;
const updated = html.replace(/<(script|link)\b([^>]*?)\b(src|href)="([^"]+)"([^>]*?)integrity="sha384-[^"]*"/g, (tag, name, before, attr, url, between) => {
  const file = path.resolve(path.dirname(view), url);
  const hash = "sha384-" + crypto.createHash("sha384").update(fs.readFileSync(file)).digest("base64");
  const next = `<${name}${before}${attr}="${url}"${between}integrity="${hash}"`;
  if (next !== tag) {
    changed++;
    console.log(`updated ${url}`);
  }
  return next;
});

fs.writeFileSync(view, updated);
console.log(`${changed} integrity hash(es) updated`);
