'use strict';

const PROTECTED = [
  /\.eslintrc(\.(js|cjs|mjs|json|yaml|yml))?$/,
  /eslint\.config\.(js|mjs|cjs|ts)$/,
  /\.prettierrc(\.(js|cjs|mjs|json|yaml|yml|toml))?$/,
  /prettier\.config\.(js|cjs|mjs|ts)$/,
  /biome\.(json|jsonc)$/,
  /\.ruff\.toml$/,
  /^ruff\.toml$/,
  /\.stylelintrc(\.(js|cjs|mjs|json|yaml|yml))?$/,
  /stylelint\.config\.(js|cjs|mjs|ts)$/,
  /\.markdownlint(rc)?(\.(js|cjs|mjs|json|yaml|yml))?$/,
];

async function run(input) {
  const filePath = input?.tool_input?.file_path || input?.tool_input?.path || '';
  const base = filePath.split('/').pop();
  for (const re of PROTECTED) {
    if (re.test(base)) {
      return {
        decision: 'block',
        reason: `[VCW] Modifying ${base} is not allowed.\nFix the source code to satisfy linter/formatter rules instead of weakening the config.\nTo make a legitimate config change, set VCW_DISABLED_HOOKS=vcw:pre:edit:config-protection temporarily.`,
      };
    }
  }
  return null;
}

module.exports = { run };
