# aaak-vault-sync

Sync your Obsidian vault to AAAK format for LLM memory loading. Converts markdown files into compact symbolic summaries that Claude (or any LLM) can scan at session start to load relevant context from your vault.

AAAK encoding is provided by [`dialect.py`](https://github.com/milla-jovovich/mempalace/blob/main/mempalace/dialect.py) from the [mempalace](https://github.com/milla-jovovich/mempalace) project.

## How it works

1. `aaak-scan` walks your Obsidian vault and converts each `.md` file to AAAK format using `dialect.py` — a lossy summarization that extracts entities, topics, key sentences, emotions, and flags into a token-efficient representation
2. Output files are written to `$VAULT/aaak/` alongside a human/LLM-readable index (`aaak_index.md`)
3. A global CLAUDE.md rule tells Claude to check the index at session start and follow relevant entries to their AAAK summaries (or the original markdown if needed)
4. A launchd agent (macOS) keeps the index updated hourly in the background

**AAAK is lossy** — it summarizes, not compresses. The original files are always preserved. AAAK files point back to their source via a `SOURCE:` header line.

## Requirements

- Python 3.7+
- Node.js 14+ (for the CLI shim and setup script)
- macOS (for the launchd scheduler — Linux/Windows users can set up a cron job manually)
- [Claude Code](https://claude.ai/code) (for the `/scan-vault` skill and CLAUDE.md memory rule)

## Installation

```bash
npm install -g aaak-vault-sync
```

Or clone and install locally:

```bash
git clone https://github.com/yourname/aaak-vault-sync
cd aaak-vault-sync
npm install -g .
```

## Setup

### 1. Set your vault path

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export OBSIDIAN_VAULT_PATH=/path/to/your/vault
```

Reload your shell:

```bash
source ~/.zshrc
```

### 2. Run setup

```bash
npm run setup
```

This installs three things:

| What | Where |
|------|-------|
| launchd agent (hourly sync) | `~/Library/LaunchAgents/com.aaak.vault-sync.plist` |
| Claude Code skill (`/scan-vault`) | `~/.claude/skills/scan-vault/SKILL.md` |
| CLAUDE.md memory rule | `~/.claude/CLAUDE.md` (appended) |

### 3. Activate the scheduler

```bash
launchctl load ~/Library/LaunchAgents/com.aaak.vault-sync.plist
```

### 4. Run an initial sync

```bash
aaak-scan --verbose
```

This scans your vault, generates AAAK files in `$VAULT/aaak/`, and writes the index.

## Usage

### CLI

```bash
# Sync new and updated files
aaak-scan

# Show what would change without writing anything
aaak-scan --dry-run

# Verbose output
aaak-scan --verbose

# Force re-scan all files (ignore mtime)
aaak-scan --force

# Combine flags
aaak-scan --dry-run --verbose
```

### Claude Code skill

Once setup is complete, invoke from any Claude Code session:

```
/scan-vault
```

Reports how many files were converted, updated, or skipped.

### Memory loading

After setup, every Claude Code session automatically:

1. Reads `$OBSIDIAN_VAULT_PATH/aaak/aaak_index.md`
2. Scans the Topics column for entries relevant to the current task
3. Reads linked AAAK files for compressed summaries of relevant docs
4. Follows `SOURCE:` lines to original markdown if full detail is needed

If `OBSIDIAN_VAULT_PATH` is not set, this step is silently skipped.

## Vault output structure

After the first sync, your vault will contain:

```
your-vault/
└── aaak/
    ├── aaak_index.md          ← LLM-readable index + embedded JSON for sync tracking
    ├── entities.json          ← Auto-detected proper noun → code mappings
    ├── note-title.aaak.md     ← Compressed AAAK summary of note-title.md
    └── folder--nested.aaak.md ← Nested paths use -- as separator
```

Each `.aaak.md` file starts with a `SOURCE:` line pointing back to the original:

```
SOURCE: projects/my-project.md
?|?|2026-04-07|my-project
0:ALJ+PRF|project_launch_decision|"We decided to launch in Q2"|determ|DECISION
```

The `aaak_index.md` table looks like:

| Source | AAAK | Last Scanned | Topics |
|--------|------|--------------|--------|
| `projects/my-project.md` | `aaak/projects--my-project.aaak.md` | 2026-04-07 | project_launch_decision |

## AAAK format

AAAK is defined in `dialect.py`, which is part of [mempalace](https://github.com/milla-jovovich/mempalace) — a broader LLM memory system. The `dialect.py` included here is sourced from [`mempalace/dialect.py`](https://github.com/milla-jovovich/mempalace/blob/main/mempalace/dialect.py).

The dialect is a structured symbolic summary:

```
FILE_NUM|PRIMARY_ENTITY|DATE|TITLE              ← Header
ZID:ENTITIES|topic_keywords|"key_quote"|WEIGHT|EMOTIONS|FLAGS  ← Zettel
T:ZID<->ZID|label                              ← Tunnel (connection)
ARC:emotion->emotion->emotion                  ← Emotional arc
```

**Emotion codes**: `joy`, `fear`, `trust`, `grief`, `wonder`, `rage`, `love`, `hope`, `despair`, `peace`, `anx`, `determ`, `convict`, `frust`, `curious`, `grat`, `satis`, `excite`, and more.

**Flags**: `ORIGIN`, `CORE`, `SENSITIVE`, `PIVOT`, `GENESIS`, `DECISION`, `TECHNICAL`

Any LLM reads AAAK natively — no special decoder required.

## Entity detection

`aaak-scan` automatically detects proper nouns (people, organizations, project names) across your vault and assigns stable 3-character codes:

- `Alice Johnson` → `ALJ`
- `Project Falcon` → `PRF`
- `Bob Smith` → `BOS`

Codes are saved to `$VAULT/aaak/entities.json` and stay stable across runs — new entities are appended, existing codes are never changed.

## Configuration

All configuration is via environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `OBSIDIAN_VAULT_PATH` | Yes | Absolute path to your Obsidian vault |

No config files needed. The scanner is intentionally zero-config beyond the vault path.

## Scheduling

### macOS (launchd)

The setup script installs a launchd agent that runs `aaak-scan` every hour.

```bash
# Check status
launchctl list | grep aaak

# View logs
cat /tmp/aaak-vault-sync.log
cat /tmp/aaak-vault-sync.err

# Stop
launchctl unload ~/Library/LaunchAgents/com.aaak.vault-sync.plist

# Start again
launchctl load ~/Library/LaunchAgents/com.aaak.vault-sync.plist
```

To change the interval, edit `~/Library/LaunchAgents/com.aaak.vault-sync.plist` and update `StartInterval` (in seconds). Then reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.aaak.vault-sync.plist
launchctl load ~/Library/LaunchAgents/com.aaak.vault-sync.plist
```

### Linux / Windows (cron)

Add a cron job:

```bash
crontab -e
```

```
0 * * * * OBSIDIAN_VAULT_PATH=/path/to/vault aaak-scan >> /tmp/aaak-vault-sync.log 2>&1
```

## Uninstall

```bash
# Stop the scheduler
launchctl unload ~/Library/LaunchAgents/com.aaak.vault-sync.plist
rm ~/Library/LaunchAgents/com.aaak.vault-sync.plist

# Remove the Claude skill
rm -rf ~/.claude/skills/scan-vault

# Remove from CLAUDE.md (delete the "## Obsidian Vault Memory" section)
# Then uninstall the package
npm uninstall -g aaak-vault-sync
```

The `$VAULT/aaak/` directory is not removed — your AAAK files stay in the vault.

## Project structure

```
aaak-vault-sync/
├── bin/
│   └── aaak-scan.js          ← CLI entry point (Node shim → python scan.py)
├── scripts/
│   └── setup.js              ← Installs plist, skill, CLAUDE.md rule
├── templates/
│   ├── com.aaak.vault-sync.plist.template
│   └── scan-vault-skill.md.template
├── scan.py                   ← Core vault scanner
├── dialect.py                ← AAAK format encoder/decoder
└── package.json
```

## License

MIT
