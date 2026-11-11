'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const STATE_ROOT = path.join(__dirname, 'state');

function statePath(...parts) {
  const target = path.join(STATE_ROOT, ...parts);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

function atomicWrite(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

module.exports = { statePath, atomicWrite, readJSON };
