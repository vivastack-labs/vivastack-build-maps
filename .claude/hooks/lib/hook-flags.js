'use strict';

const VALID_PROFILES = new Set(['minimal', 'standard', 'strict']);

function getCurrentProfile() {
  const raw = (process.env.VCW_HOOK_PROFILE || 'standard').toLowerCase().trim();
  return VALID_PROFILES.has(raw) ? raw : 'standard';
}

function getDisabledHooks() {
  return new Set((process.env.VCW_DISABLED_HOOKS || '').split(',').filter(Boolean));
}

function isHookEnabled(hookId, requiredProfiles) {
  if (getDisabledHooks().has(hookId)) return false;
  const current = getCurrentProfile();
  return requiredProfiles.map(p => p.trim()).includes(current);
}

module.exports = { isHookEnabled, getCurrentProfile };
