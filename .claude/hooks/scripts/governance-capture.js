'use strict';
const fs = require('fs');
const { statePath } = require('../lib/state');
const { sanitize } = require('../lib/sanitize');

// Only runs when VCW_GOVERNANCE_CAPTURE=1
const SECRET_RE = /(AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{36}|eyJ[A-Za-z0-9._-]{20,})/;
const DANGEROUS_CMDS = /\brm\s+-rf\b|\bgit\s+push\s+--force\b|\bDROP\s+TABLE\b/i;
const SENSITIVE_PATHS = /\.(env|pem|key|p12|pfx)$|id_rsa|id_ed25519/;

async function run(input) {
  if (process.env.VCW_GOVERNANCE_CAPTURE !== '1') return;

  try {
    const events = [];
    const raw = JSON.stringify(input);

    if (SECRET_RE.test(raw)) events.push({ type: 'secret_detected', tool: input?.tool_name });
    const cmd = input?.tool_input?.command || '';
    if (DANGEROUS_CMDS.test(cmd)) events.push({ type: 'dangerous_command', cmd: sanitize(cmd) });
    const filePath = input?.tool_input?.file_path || '';
    if (SENSITIVE_PATHS.test(filePath)) events.push({ type: 'sensitive_file', path: filePath });

    if (events.length > 0) {
      const logFile = statePath('governance.jsonl');
      const ts = new Date().toISOString();
      for (const e of events) {
        fs.appendFileSync(logFile, JSON.stringify({ ts, ...e }) + '\n', 'utf8');
      }
    }
  } catch { /* non-blocking */ }
}

module.exports = { run };
