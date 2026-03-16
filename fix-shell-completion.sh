#!/usr/bin/env bash
# fix-shell-completion.sh
# Fixes "command not found: compdef" in openclaw.zsh
# Safe to run multiple times (idempotent)

set -euo pipefail

COMPLETION_FILE="$HOME/.openclaw/completions/openclaw.zsh"
ZSHRC="$HOME/.zshrc"
BACKUP_SUFFIX=".bak.$(date +%Y%m%d%H%M%S)"

echo "=== OpenClaw Shell Completion Fix ==="
echo ""

# --- Step 1: Verify the completion file exists ---
if [[ ! -f "$COMPLETION_FILE" ]]; then
  echo "ERROR: Completion file not found at $COMPLETION_FILE"
  echo "Please reinstall openclaw or run: openclaw completion zsh > $COMPLETION_FILE"
  exit 1
fi
echo "Found completion file: $COMPLETION_FILE"

# --- Step 2: Check if already patched ---
if grep -q 'OPENCLAW_COMPFIX_APPLIED' "$COMPLETION_FILE"; then
  echo "Completion file is already patched. Nothing to do."
  exit 0
fi

# --- Step 3: Back up the original ---
cp "$COMPLETION_FILE" "${COMPLETION_FILE}${BACKUP_SUFFIX}"
echo "Backup created: ${COMPLETION_FILE}${BACKUP_SUFFIX}"

# --- Step 4: Prepend the compdef guard to the file ---
# The guard redefines compdef as a collector if compinit has not been loaded yet,
# then flushes all collected calls at the first prompt via a precmd hook.
# A sentinel comment marks the file so idempotency is detectable.
GUARD='# OPENCLAW_COMPFIX_APPLIED
# Guard: defer compdef calls until compinit is available
if ! (( ${+functions[compdef]} )); then
  typeset -ga _openclaw_deferred_compdefs
  function compdef() { _openclaw_deferred_compdefs+=("$*"); }
  function _openclaw_flush_compdefs() {
    autoload -Uz compinit
    compinit
    for _cmd in "${_openclaw_deferred_compdefs[@]}"; do
      eval "compdef $_cmd"
    done
    unset _openclaw_deferred_compdefs
    add-zsh-hook -d precmd _openclaw_flush_compdefs
    unfunction _openclaw_flush_compdefs 2>/dev/null || true
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook precmd _openclaw_flush_compdefs
fi
'

# Use a temp file to prepend (avoids in-place corruption)
TMPFILE=$(mktemp)
printf '%s\n' "$GUARD" | cat - "$COMPLETION_FILE" > "$TMPFILE"
mv "$TMPFILE" "$COMPLETION_FILE"
echo "Patched: guard block prepended to $COMPLETION_FILE"

# --- Step 5: Check .zshrc sources the completion file ---
if ! grep -q 'openclaw' "$ZSHRC" 2>/dev/null; then
  echo ""
  echo "NOTE: Your .zshrc does not appear to source openclaw completions."
  echo "Add this line to $ZSHRC (after any compinit call if you have one):"
  echo "  source ~/.openclaw/completions/openclaw.zsh"
else
  echo "Completion is already referenced in $ZSHRC"
fi

echo ""
echo "Fix applied successfully."
echo "Open a new terminal (or run 'exec zsh') to verify the fix."
