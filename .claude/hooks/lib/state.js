"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_ROOT = path.join(os.homedir(), ".claude", "vivastack-cc-workflows");
const STATE_DIRS = [
  STATE_ROOT,
  path.join(STATE_ROOT, "sessions"),
  path.join(STATE_ROOT, "metrics"),
  path.join(STATE_ROOT, "gateguard"),
  path.join(STATE_ROOT, "tmp"),
];

function ensureDirs() {
  for (const dir of STATE_DIRS) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function statePath(...parts) {
  ensureDirs();
  return path.join(STATE_ROOT, ...parts);
}

function atomicWrite(filePath, data) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(
    tmp,
    typeof data === "string" ? data : JSON.stringify(data, null, 2),
    "utf8",
  );
  fs.renameSync(tmp, filePath);
}

function readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

module.exports = { statePath, atomicWrite, readJSON, STATE_ROOT };
