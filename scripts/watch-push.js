#!/usr/bin/env node

import { execSync, spawn } from 'child_process';

/**
 * Wrapper script for watch:push that handles target selection before starting watch mode
 */
async function main() {
  const args = process.argv.slice(2);
  const target = args[0] || ''; // Empty string for interactive mode

  console.log('Setting up deployment target...\n');

  // Run setup with the target (or prompt if empty)
  try {
    execSync(`node scripts/clasp-deploy.js setup ${target}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Setup failed');
    process.exit(1);
  }

  console.log('\nStarting watch mode with auto-push...');

  // Start rollup watch mode with CLASP_PUSH environment variable
  const rollup = spawn('rollup', ['-c', '-w'], {
    stdio: 'inherit',
    env: { ...process.env, CLASP_PUSH: 'true' }
  });

  // Handle process termination
  process.on('SIGINT', () => {
    rollup.kill('SIGINT');
    process.exit(0);
  });

  rollup.on('close', (code) => {
    process.exit(code);
  });
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});