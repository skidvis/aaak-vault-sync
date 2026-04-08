#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const scanPy = path.join(__dirname, '..', 'scan.py');
const args = process.argv.slice(2);

const result = spawnSync('python3', [scanPy, ...args], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error('Error: python3 not found. Install Python 3 and ensure it is on your PATH.');
  } else {
    console.error('Error:', result.error.message);
  }
  process.exit(1);
}

process.exit(result.status ?? 0);
