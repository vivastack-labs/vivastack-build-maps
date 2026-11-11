'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

const EVENT_AUDIO_MAP = {
  SessionStart: 'sessionstart',
  SessionEnd: 'sessionend',
  PermissionRequest: 'agent_permissionrequest',
  TaskCreated: 'taskcreated',
  TaskCompleted: 'taskcompleted',
  PostCompact: 'postcompact',
  PreCompact: 'precompact',
  Notification: 'notification',
  Stop: 'stop',
  WorktreeCreate: 'worktreecreate',
  WorktreeRemove: 'worktreeremove',
  ConfigChange: 'configchange',
  StopFailure: 'stopfailure',
  CwdChanged: 'cwdchanged',
  FileChanged: 'filechanged',
  PermissionDenied: 'permissiondenied',
  UserPromptExpansion: 'userpromptexpansion',
  PostToolBatch: 'posttoolbatch',
  MessageDisplay: 'messagedisplay',
  InstructionsLoaded: 'instructionsloaded',
};

function getAudioPath(hookEventName) {
  const pluginRoot = process.env.VCW_PLUGIN_ROOT;
  if (!pluginRoot) return null;
  const folder = EVENT_AUDIO_MAP[hookEventName];
  if (!folder) return null;
  return path.join(pluginRoot, 'hooks', 'audios', folder, `${folder}.wav`);
}

function playAudio(audioPath) {
  if (process.env.WSL_DISTRO_NAME) {
    const winPath = execFileSync('wslpath', ['-w', audioPath], { encoding: 'utf8' }).trim();
    const cmd = `(New-Object Media.SoundPlayer '${winPath.replace(/'/g, "''")}').PlaySync()`;
    execFileSync('powershell.exe', ['-Command', cmd], { stdio: 'ignore', timeout: 5000 });
  } else if (process.platform === 'darwin') {
    execFileSync('afplay', [audioPath], { stdio: 'ignore', timeout: 5000 });
  } else {
    try {
      execFileSync('aplay', [audioPath], { stdio: 'ignore', timeout: 5000 });
    } catch {
      execFileSync('paplay', [audioPath], { stdio: 'ignore', timeout: 5000 });
    }
  }
}

async function run(input) {
  const audioPath = getAudioPath(input?.hook_event_name);
  if (!audioPath) return null;
  try {
    playAudio(audioPath);
  } catch { /* non-blocking */ }
  return null;
}

module.exports = { run, getAudioPath, EVENT_AUDIO_MAP };
