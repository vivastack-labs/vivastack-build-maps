'use strict';
const fs = require('fs');

const FRONTEND_EXTS = /\.(tsx|jsx|astro|vue|svelte|css)$/;
const GENERIC_SIGNALS = [
  { re: /["']Get Started["']/i, msg: 'generic CTA "Get Started"' },
  { re: /["']Learn more["']/i, msg: 'generic CTA "Learn more"' },
  { re: /grid-cols-[34]\b/, msg: 'generic grid layout (grid-cols-3/4)' },
  { re: /bg-gradient-to-/, msg: 'generic gradient background' },
  { re: /\btext-center\b/, msg: 'pervasive text-center' },
  { re: /\bfont-sans\b/, msg: 'default font-sans (no custom font)' },
];

async function run(input) {
  try {
    const filePath = input?.tool_input?.file_path || input?.tool_input?.path || '';
    if (!filePath || !FRONTEND_EXTS.test(filePath)) return;
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const hits = GENERIC_SIGNALS.filter(({ re }) => re.test(content)).map(s => s.msg);

    if (hits.length > 0) {
      process.stderr.write(`[VCW] Design quality: ${filePath} has generic UI signals: ${hits.join(', ')}.\nConsider more intentional design.\n`);
    }
  } catch { /* non-blocking */ }
}

module.exports = { run };
