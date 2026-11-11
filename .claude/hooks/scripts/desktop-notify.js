// plugins/vivastack-core/hooks/scripts/desktop-notify.js
'use strict';
const { execSync } = require('child_process');

async function run(input) {
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      execSync(`osascript -e 'display notification "Claude is done" with title "VCW"'`, { stdio: 'ignore' });
    } else if (platform === 'win32' || process.env.WSL_DISTRO_NAME) {
      execSync(`powershell.exe -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Claude is done')"`, { stdio: 'ignore', timeout: 3000 });
    }
    // Linux without WSL: no-op (no standard notification mechanism assumed)
  } catch { /* non-blocking — notification failure is never fatal */ }
}

module.exports = { run };
