#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import path from "node:path";

const thisFile = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(thisFile), "..");
const serverEntry = path.join(appRoot, "build", "server.js");
const webEntry = path.join(appRoot, "dist", "index.html");

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

if (!fs.existsSync(serverEntry)) {
  console.error("Missing compiled server entry: build/server.js");
  console.error("Run `npm run build` before launching graphos.");
  process.exit(1);
}

if (!fs.existsSync(webEntry)) {
  console.error("Missing compiled web entry: dist/index.html");
  console.error("Run `npm run build` before launching graphos.");
  process.exit(1);
}

await import(pathToFileURL(serverEntry).href);
