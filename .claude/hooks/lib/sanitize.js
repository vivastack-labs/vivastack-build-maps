'use strict';

const PATTERNS = [
  [/\b(AKIA|ASIA|AROA|AIDA)[A-Z0-9]{16}\b/g, '[REDACTED]'],
  [/ghp_[A-Za-z0-9]{36}/g, '[REDACTED]'],
  [/github_pat_[A-Za-z0-9_]{82}/g, '[REDACTED]'],
  [/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]'],
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[REDACTED]'],
  [/(password|passwd|secret|token|api_?key)\s*[=:]\s*\S+/gi, (m, k) => `${k}=[REDACTED]`],
];

function sanitize(str) {
  if (typeof str !== 'string') return str;
  return PATTERNS.reduce((s, [re, rep]) => s.replace(re, rep), str);
}

module.exports = { sanitize };
