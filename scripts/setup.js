#!/usr/bin/env node
'use strict';

/**
 * aaak-vault-sync setup
 *
 * Installs:
 *   1. launchd agent  → ~/Library/LaunchAgents/com.aaak.vault-sync.plist
 *   2. Claude skill   → ~/.claude/skills/scan-vault/SKILL.md
 *   3. CLAUDE.md rule → ~/.claude/CLAUDE.md  (appended if missing)
 *
 * Usage:
 *   npm run setup
 *   node scripts/setup.js
 *   OBSIDIAN_VAULT_PATH=/path/to/vault node scripts/setup.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const PLATFORM = os.platform();

// ── Paths ──────────────────────────────────────────────────────────────────

const LAUNCH_AGENTS_DIR = path.join(HOME, 'Library', 'LaunchAgents');
const PLIST_DEST        = path.join(LAUNCH_AGENTS_DIR, 'com.aaak.vault-sync.plist');
const CLAUDE_DIR        = path.join(HOME, '.claude');
const SKILLS_DIR        = path.join(CLAUDE_DIR, 'skills', 'scan-vault');
const SKILL_DEST        = path.join(SKILLS_DIR, 'SKILL.md');
const CLAUDE_MD_PATH    = path.join(CLAUDE_DIR, 'CLAUDE.md');

const PLIST_TEMPLATE    = path.join(PACKAGE_ROOT, 'templates', 'com.aaak.vault-sync.plist.template');
const SKILL_TEMPLATE    = path.join(PACKAGE_ROOT, 'templates', 'scan-vault-skill.md.template');
const SCAN_PY           = path.join(PACKAGE_ROOT, 'scan.py');

// ── Helpers ────────────────────────────────────────────────────────────────

function findPython() {
  for (const cmd of ['python3', 'python']) {
    try {
      const p = execSync(`which ${cmd} 2>/dev/null`).toString().trim();
      if (p) return p;
    } catch (_) {}
  }
  return '/usr/bin/python3'; // safe fallback on macOS
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(msg)  { console.log(`  ${msg}`); }
function ok(msg)   { console.log(`\u2713 ${msg}`); }
function warn(msg) { console.log(`\u26a0 ${msg}`); }
function bold(msg) { return `\x1b[1m${msg}\x1b[0m`; }

// ── Steps ──────────────────────────────────────────────────────────────────

function installLaunchdAgent(vaultPath, python) {
  if (PLATFORM !== 'darwin') {
    warn('Skipping launchd agent (macOS only). Set up a cron job manually instead:');
    log(`  crontab -e  →  0 * * * * OBSIDIAN_VAULT_PATH=${vaultPath || '/path/to/vault'} ${python} ${SCAN_PY}`);
    return;
  }

  const template = fs.readFileSync(PLIST_TEMPLATE, 'utf8');
  const plist = template
    .replace('{{PYTHON}}',     python)
    .replace('{{SCAN_PY}}',    SCAN_PY)
    .replace('{{VAULT_PATH}}', vaultPath || 'YOUR_VAULT_PATH_HERE');

  ensureDir(LAUNCH_AGENTS_DIR);
  fs.writeFileSync(PLIST_DEST, plist);
  ok(`Plist written: ${PLIST_DEST}`);

  if (!vaultPath) {
    warn(`OBSIDIAN_VAULT_PATH not set — edit the plist before loading:`);
    log(`  ${PLIST_DEST}`);
    log(`  Replace YOUR_VAULT_PATH_HERE with your vault path, then:`);
    log(`  launchctl load "${PLIST_DEST}"`);
  } else {
    log(`Vault path: ${vaultPath}`);
    log(`To activate: launchctl load "${PLIST_DEST}"`);
  }
}

function installClaudeSkill() {
  if (!fs.existsSync(CLAUDE_DIR)) {
    warn(`~/.claude/ not found — is Claude Code installed? Skipping skill install.`);
    log(`You can install manually later: mkdir -p ${SKILLS_DIR} && cp ${SKILL_TEMPLATE} ${SKILL_DEST}`);
    return;
  }

  ensureDir(SKILLS_DIR);
  const skill = fs.readFileSync(SKILL_TEMPLATE, 'utf8');
  fs.writeFileSync(SKILL_DEST, skill);
  ok(`Skill installed: ${SKILL_DEST}`);
  log(`Invoke with /scan-vault in any Claude Code session`);
}

function installClaudeMdRule() {
  const rule = [
    '',
    '## Obsidian Vault Memory',
    '',
    'I maintain an AAAK memory index of my Obsidian vault at:',
    '`$OBSIDIAN_VAULT_PATH/aaak/aaak_index.md`',
    '',
    '**At the start of each session**, if `OBSIDIAN_VAULT_PATH` is set and the index file exists:',
    '1. Read `$OBSIDIAN_VAULT_PATH/aaak/aaak_index.md`',
    '2. Scan the Topics column for entries relevant to what the user is working on',
    '3. For relevant entries, read the linked AAAK file (column 2, relative to vault root) for a compressed summary',
    '4. If deeper detail is needed, follow the `SOURCE:` line in the AAAK file to read the original markdown',
    '',
    '**During the session**, re-check the index if a new topic arises that might have vault context.',
    '',
    'If `OBSIDIAN_VAULT_PATH` is not set or the index file does not exist yet, silently skip.',
    '',
    'To refresh the vault index from within a session, use the `/scan-vault` skill.',
    '',
  ].join('\n');

  if (!fs.existsSync(CLAUDE_DIR)) {
    warn(`~/.claude/ not found — skipping CLAUDE.md update.`);
    return;
  }

  if (fs.existsSync(CLAUDE_MD_PATH)) {
    const existing = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
    if (existing.includes('## Obsidian Vault Memory')) {
      ok(`CLAUDE.md already has vault memory rule — skipping`);
      return;
    }
    fs.appendFileSync(CLAUDE_MD_PATH, rule);
    ok(`CLAUDE.md updated: ${CLAUDE_MD_PATH}`);
  } else {
    fs.writeFileSync(CLAUDE_MD_PATH, rule.trimStart());
    ok(`CLAUDE.md created: ${CLAUDE_MD_PATH}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log(bold('\naaak-vault-sync setup\n'));

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH || '';
  const python    = findPython();

  log(`scan.py:  ${SCAN_PY}`);
  log(`python3:  ${python}`);
  log(`vault:    ${vaultPath || '(not set — OBSIDIAN_VAULT_PATH is empty)'}\n`);

  installLaunchdAgent(vaultPath, python);
  console.log('');
  installClaudeSkill();
  console.log('');
  installClaudeMdRule();

  console.log(bold('\nNext steps:'));
  if (!vaultPath) {
    log('1. Add to ~/.zshrc (or ~/.bashrc):');
    log('     export OBSIDIAN_VAULT_PATH=/path/to/your/vault');
    log('   Then re-run: npm run setup');
    log('');
  }
  if (PLATFORM === 'darwin') {
    const loadCmd = `launchctl load "${PLIST_DEST}"`;
    log(`${vaultPath ? '1' : '2'}. Load the scheduler:`);
    log(`     ${loadCmd}`);
    log('');
    log(`${vaultPath ? '2' : '3'}. Run a manual sync to verify:`);
  } else {
    log(`${vaultPath ? '1' : '2'}. Run a manual sync to verify:`);
  }
  log('     aaak-scan --verbose');
  console.log('');
}

main();
