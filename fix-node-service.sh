#!/usr/bin/env bash
# fix-node-service.sh
# Diagnoses and fixes the openclaw node LaunchAgent startup issue
# Targets macOS launchd (gui/$UID domain)
# Safe to run multiple times (idempotent)

set -uo pipefail  # no -e: launchctl returns non-zero in expected cases

PLIST_PATH="$HOME/Library/LaunchAgents/ai.openclaw.node.plist"
SERVICE_LABEL="ai.openclaw.node"

pass() { echo "[PASS] $*"; }
fail() { echo "[FAIL] $*"; }
info() { echo "[INFO] $*"; }
warn() { echo "[WARN] $*"; }
die()  { echo "[ERROR] $*"; exit 1; }

echo "=== OpenClaw Node Service Fix ==="
echo ""

# --- Step 1: macOS only ---
if [[ "$(uname)" != "Darwin" ]]; then
  die "This script is macOS-only (requires launchctl)."
fi

# --- Step 2: Verify plist exists ---
echo "--- Checking plist ---"
if [[ ! -f "$PLIST_PATH" ]]; then
  die "Plist not found at $PLIST_PATH. Run 'openclaw node install' first."
fi
pass "Plist exists: $PLIST_PATH"

# --- Step 3: Validate plist syntax ---
echo ""
echo "--- Validating plist ---"
if ! plutil -lint "$PLIST_PATH" > /dev/null 2>&1; then
  fail "Plist is malformed:"
  plutil -lint "$PLIST_PATH"
  die "Fix the plist file and re-run this script."
fi
pass "Plist syntax is valid"

# --- Step 4: Check Label key matches filename ---
echo ""
echo "--- Checking Label key ---"
PLIST_LABEL=$(plutil -extract Label raw "$PLIST_PATH" 2>/dev/null || true)
if [[ -z "$PLIST_LABEL" ]]; then
  warn "Could not read Label from plist — skipping label check."
elif [[ "$PLIST_LABEL" != "$SERVICE_LABEL" ]]; then
  warn "Label in plist ('$PLIST_LABEL') does not match expected '$SERVICE_LABEL'."
  warn "launchd requires the Label to match the filename (without .plist)."
  SERVICE_LABEL="$PLIST_LABEL"
  warn "Continuing with actual label: $SERVICE_LABEL"
else
  pass "Label matches filename: $SERVICE_LABEL"
fi

# --- Step 5: Check plist ownership and permissions ---
echo ""
echo "--- Checking plist permissions ---"
PLIST_OWNER=$(stat -f '%Su' "$PLIST_PATH")
PLIST_MODE=$(stat -f '%Lp' "$PLIST_PATH")
CURRENT_USER=$(whoami)

if [[ "$PLIST_OWNER" != "$CURRENT_USER" ]]; then
  warn "Plist owned by '$PLIST_OWNER', not '$CURRENT_USER'. Fixing..."
  chown "$CURRENT_USER" "$PLIST_PATH" \
    && pass "Ownership fixed" \
    || die "Could not fix ownership. Try: sudo chown $CURRENT_USER $PLIST_PATH"
else
  pass "Plist ownership OK: $PLIST_OWNER"
fi

if [[ "$PLIST_MODE" != "644" ]]; then
  warn "Plist permissions are $PLIST_MODE, expected 644. Fixing..."
  chmod 644 "$PLIST_PATH" && pass "Permissions fixed to 644" || die "Could not fix permissions"
else
  pass "Plist permissions OK: 644"
fi

# --- Step 6: Verify the program binary exists ---
echo ""
echo "--- Checking program binary ---"
PROGRAM=$(plutil -extract ProgramArguments.0 raw "$PLIST_PATH" 2>/dev/null \
  || plutil -extract Program raw "$PLIST_PATH" 2>/dev/null \
  || true)
if [[ -z "$PROGRAM" ]]; then
  warn "Could not extract binary path from plist — skipping binary check."
elif [[ ! -f "$PROGRAM" ]]; then
  die "Binary not found: $PROGRAM\nReinstall openclaw or correct the plist Program path."
elif [[ ! -x "$PROGRAM" ]]; then
  warn "Binary not executable: $PROGRAM. Fixing..."
  chmod +x "$PROGRAM" && pass "Binary is now executable" || die "Could not chmod binary"
else
  pass "Binary OK: $PROGRAM"
fi

# --- Step 7: Bootout any stale registration ---
echo ""
echo "--- Removing any stale service registration ---"
if launchctl print "gui/$UID/$SERVICE_LABEL" > /dev/null 2>&1; then
  info "Service currently registered. Booting out..."
  launchctl bootout "gui/$UID" "$PLIST_PATH" 2>/dev/null \
    || launchctl bootout "gui/$UID/$SERVICE_LABEL" 2>/dev/null \
    || true
  sleep 1
  pass "Bootout complete"
else
  info "Service not currently registered (clean state)"
fi

# --- Step 8: Bootstrap the service ---
echo ""
echo "--- Bootstrapping service ---"
if launchctl bootstrap "gui/$UID" "$PLIST_PATH"; then
  pass "Bootstrap succeeded"
else
  fail "Bootstrap failed. Collecting diagnostics..."
  echo ""
  echo "--- Diagnostic: launchctl verbose output ---"
  launchctl bootstrap "gui/$UID" "$PLIST_PATH" 2>&1 || true
  echo ""
  echo "--- Diagnostic: recent system log (openclaw entries) ---"
  log show --predicate 'process == "launchd"' --last 2m --style compact 2>/dev/null \
    | grep -i "openclaw\|$SERVICE_LABEL" | tail -20 || true
  die "Bootstrap failed. Common causes: binary not found, Label mismatch, or SIP restriction."
fi

# --- Step 9: Verify the service is running ---
echo ""
echo "--- Verifying service status ---"
sleep 2
SERVICE_INFO=$(launchctl print "gui/$UID/$SERVICE_LABEL" 2>/dev/null || true)

if [[ -z "$SERVICE_INFO" ]]; then
  fail "Service does not appear in launchctl print after bootstrap."
else
  pass "Service is registered"
  PID=$(echo "$SERVICE_INFO" | grep -E '^\s+pid\s*=' | awk '{print $3}' || true)
  LAST_EXIT=$(echo "$SERVICE_INFO" | grep -E 'last exit code' | awk '{print $NF}' || true)
  if [[ -n "$PID" ]]; then
    pass "Service is running with PID $PID"
  else
    warn "Service registered but no PID — may have exited immediately"
    [[ -n "$LAST_EXIT" ]] && warn "Last exit code: $LAST_EXIT"
  fi
fi

# --- Step 10: Check openclaw nodes list ---
echo ""
echo "--- Checking openclaw nodes list ---"
if command -v openclaw > /dev/null 2>&1; then
  openclaw nodes list 2>&1 || true
  echo ""
  info "If the node is not yet visible, wait a few seconds and run 'openclaw nodes list' again."
else
  warn "'openclaw' not found in PATH — skipping node list check."
fi

# --- Step 11: Tail recent logs ---
echo ""
echo "--- Recent service logs ---"
LOG_DIR="$HOME/.openclaw/logs"
NODE_LOG="$LOG_DIR/node.log"
if [[ -f "$NODE_LOG" ]]; then
  echo "== $NODE_LOG =="
  tail -20 "$NODE_LOG"
else
  info "No log file found at $NODE_LOG"
  info "Check the StandardOutPath/StandardErrorPath values in your plist for the actual log path."
fi

echo ""
echo "=== Fix script complete ==="
echo "To check service status manually: launchctl print gui/\$UID/$SERVICE_LABEL"
