'use strict';

/**
 * Viva Knowledge Layer — category-keyed upsert into docs/viva-knowledge.md.
 *
 * The coordinator shells out to this with arguments only; all Markdown
 * parse/rewrite/rotation logic is encapsulated here so the coordinator's
 * context stays minimal.
 *
 * Design: docs/specs/2026-05-18-viva-knowledge-layer.md
 */

const fs = require('fs');

const HEADER = [
  '# Viva Knowledge Base',
  '<!-- viva-coordinator auto-maintained. category=<stage>:<subtype>.',
  '     Latest resolution is the head. Up to 3 recent distinct symptoms kept. -->',
  '',
].join('\n');

const MAX_HISTORY = 3;
const SEP = ' -> ';

/** Collapse a free-form field into a single safe line. */
function oneLine(s) {
  return String(s == null ? '' : s)
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** The dedupe key for a Latest/bullet line is the text before the first ' -> '. */
function symptomKey(latestText) {
  const idx = latestText.indexOf(SEP);
  return (idx === -1 ? latestText : latestText.slice(0, idx)).trim();
}

/** Strip a trailing ' (run-id)' marker from a history bullet. */
function bulletText(bullet) {
  return bullet.replace(/\s*\([^()]*\)\s*$/, '').trim();
}

/**
 * Parse the knowledge document into an ordered model.
 * @returns {{order: string[], sections: Object<string, {latest:string, seen:number, lastRun:string, lastTs:string, bullets:string[]}>}}
 */
function parseKnowledge(text) {
  const order = [];
  const sections = {};
  if (!text) return { order, sections };

  const lines = text.split('\n');
  let cur = null;
  for (const line of lines) {
    const head = line.match(/^##\s+category:\s+(\S+)\s*$/);
    if (head) {
      cur = head[1];
      order.push(cur);
      sections[cur] = { latest: '', seen: 1, lastRun: '', lastTs: '', bullets: [] };
      continue;
    }
    if (!cur) continue;

    const latest = line.match(/^\*\*Latest:\*\*\s*(.*)$/);
    if (latest) { sections[cur].latest = latest[1].trim(); continue; }

    const seen = line.match(/^\*\*Seen:\*\*\s*(\d+)x\s*-\s*last run\s+(\S+)\s*\(([^()]*)\)\s*$/);
    if (seen) {
      sections[cur].seen = parseInt(seen[1], 10);
      sections[cur].lastRun = seen[2];
      sections[cur].lastTs = seen[3];
      continue;
    }

    const bullet = line.match(/^-\s+(.*\S)\s*$/);
    if (bullet) { sections[cur].bullets.push(bullet[1].trim()); continue; }
  }
  return { order, sections };
}

/** Render the model back to the canonical Markdown form. */
function renderKnowledge(model) {
  const parts = [HEADER];
  for (const slug of model.order) {
    const s = model.sections[slug];
    const block = [
      '',
      `## category: ${slug}`,
      `**Latest:** ${s.latest}`,
      `**Seen:** ${s.seen}x - last run ${s.lastRun} (${s.lastTs})`,
    ];
    if (s.bullets.length) {
      block.push('');
      for (const b of s.bullets) block.push(`- ${b}`);
    }
    parts.push(block.join('\n'));
  }
  return parts.join('\n') + '\n';
}

/**
 * Apply one upsert to the model in place.
 * @param {object} model parseKnowledge() result
 * @param {object} entry { category, symptom, resolution?, unresolvedDecision?, runId, ts }
 */
function applyUpsert(model, entry) {
  const category = oneLine(entry.category);
  const symptom = oneLine(entry.symptom);
  const runId = oneLine(entry.runId) || 'unknown';
  const ts = oneLine(entry.ts) || new Date().toISOString();

  const latestText = entry.unresolvedDecision
    ? `${symptom}${SEP}UNRESOLVED (user: ${oneLine(entry.unresolvedDecision)})`
    : `${symptom}${SEP}${oneLine(entry.resolution)}`;

  const existing = model.sections[category];
  if (!existing) {
    model.order.push(category);
    model.sections[category] = {
      latest: latestText,
      seen: 1,
      lastRun: runId,
      lastTs: ts,
      bullets: [],
    };
    return model;
  }

  const demoted = `${existing.latest} (${existing.lastRun})`;
  const newKey = symptomKey(latestText);
  const kept = existing.bullets.filter((b) => symptomKey(bulletText(b)) !== newKey);
  const bullets = [demoted, ...kept].slice(0, MAX_HISTORY);

  model.sections[category] = {
    latest: latestText,
    seen: existing.seen + 1,
    lastRun: runId,
    lastTs: ts,
    bullets,
  };
  return model;
}

/** Read → upsert → write. Creates the file (header only) if missing. */
function upsertFile(opts) {
  const mdPath = opts.mdPath;
  let text = '';
  try {
    text = fs.readFileSync(mdPath, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const model = parseKnowledge(text);
  applyUpsert(model, opts);
  fs.writeFileSync(mdPath, renderKnowledge(model));
  return mdPath;
}

/**
 * CLI:
 *   viva-knowledge.js upsert <md> <category> <symptom> <resolution|--unresolved:<decision>> <run_id> [ts]
 */
function parseArgv(argv) {
  const [cmd, mdPath, category, symptom, resolutionArg, runId, ts] = argv;
  if (cmd !== 'upsert') {
    throw new Error(`unknown command: ${cmd || '(none)'} — expected "upsert"`);
  }
  if (!mdPath || !category || symptom == null || resolutionArg == null || !runId) {
    throw new Error('usage: upsert <md> <category> <symptom> <resolution|--unresolved:<decision>> <run_id> [ts]');
  }
  const unresolved = resolutionArg.match(/^--unresolved:(.+)$/);
  return {
    mdPath,
    category,
    symptom,
    resolution: unresolved ? undefined : resolutionArg,
    unresolvedDecision: unresolved ? unresolved[1] : undefined,
    runId,
    ts: ts || new Date().toISOString(),
  };
}

function main(argv) {
  const opts = parseArgv(argv);
  const out = upsertFile(opts);
  process.stdout.write(`[viva-knowledge] upserted ${opts.category} -> ${out}\n`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`[viva-knowledge] ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  HEADER,
  MAX_HISTORY,
  oneLine,
  symptomKey,
  bulletText,
  parseKnowledge,
  renderKnowledge,
  applyUpsert,
  upsertFile,
  parseArgv,
};
