#!/usr/bin/env node
'use strict';

// Launches the Claude Usage Pet (Electron) from the installed npm package.
// Detaches so your terminal returns; quit the pet via its menu (right-click the
// mascot → Quit, or the menu-bar icon).

const { spawn } = require('child_process');
const path = require('path');

let electron;
try {
  electron = require('electron'); // resolves to the electron binary path
} catch {
  console.error('Could not load electron. Try reinstalling: npm i -g claude-usage-pet');
  process.exit(1);
}

const appDir = path.join(__dirname, '..');
const child = spawn(electron, [appDir], { stdio: 'ignore', detached: true });
child.on('error', (e) => {
  console.error('Failed to start Claude Usage Pet:', e.message);
  process.exit(1);
});
child.unref();
console.log('🐾 Claude Usage Pet is running. Right-click the mascot → Quit to stop.');
