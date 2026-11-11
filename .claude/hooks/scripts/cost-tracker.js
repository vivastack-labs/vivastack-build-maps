// plugins/vivastack-core/hooks/scripts/cost-tracker.js
'use strict';
const fs = require('fs');
const { statePath } = require('../lib/state');

// Blended per-token rates (USD per 1M tokens, as of 2026)
const RATES = {
  'claude-opus':   { input: 15, output: 75 },
  'claude-sonnet': { input: 3,  output: 15 },
  'claude-haiku':  { input: 0.8, output: 4 },
};

function detectModel(modelId) {
  if (!modelId) return 'claude-sonnet';
  const m = modelId.toLowerCase();
  if (m.includes('opus')) return 'claude-opus';
  if (m.includes('haiku')) return 'claude-haiku';
  return 'claude-sonnet';
}

async function run(input) {
  try {
    const usage = input?.usage;
    if (!usage) return;

    const model = detectModel(input?.model);
    const rates = RATES[model];
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const costUsd = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;

    const row = {
      ts: new Date().toISOString(),
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Math.round(costUsd * 1e6) / 1e6,
    };

    fs.appendFileSync(statePath('metrics', 'costs.jsonl'), JSON.stringify(row) + '\n', 'utf8');
  } catch { /* non-blocking */ }
}

module.exports = { run };
