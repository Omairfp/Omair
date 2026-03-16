# Omair

Fix scripts for OpenClaw issues on macOS.

## Fix 1: Shell Completion Error (`compdef: command not found`)

### Problem

The file `~/.openclaw/completions/openclaw.zsh` calls `compdef` at startup,
but `compdef` is only available after `compinit` has been initialised.
If `openclaw.zsh` is sourced early in `.zshrc`, before
`autoload -Uz compinit && compinit`, this error is thrown on every new shell:

```
/Users/omairpenwala/.openclaw/completions/openclaw.zsh:3874: command not found: compdef
```

### Fix

```bash
chmod +x fix-shell-completion.sh
./fix-shell-completion.sh
```

The script:
- Backs up the original `~/.openclaw/completions/openclaw.zsh`
- Prepends a guard block that defers `compdef` calls until `compinit` is available (via a `precmd` hook)
- Is idempotent — safe to run more than once

After running, open a new terminal or run `exec zsh` to verify the error is gone.

---

## Fix 2: Node LaunchAgent Not Starting

### Problem

The OpenClaw node LaunchAgent fails to bootstrap:

```
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.node.plist
→ Bootstrap failed: 5: Input/output error
```

As a result the node never starts and does not appear in `openclaw nodes list`.

### Fix

```bash
chmod +x fix-node-service.sh
./fix-node-service.sh
```

The script:
1. Validates the plist exists and is well-formed
2. Checks the `Label` key matches the filename (required by launchd — most common cause of Error 5)
3. Corrects plist ownership and permissions (`644`, owned by current user)
4. Verifies the node binary exists and is executable
5. Boots out any stale registration before re-bootstrapping
6. Bootstraps cleanly using the `gui/$UID` domain
7. Verifies the service is running
8. Checks `openclaw nodes list`
9. Prints recent service logs on failure

### Manual verification

```bash
# Check service status
launchctl print gui/$UID/ai.openclaw.node

# View service logs
tail -f ~/.openclaw/logs/node.log

# List nodes
openclaw nodes list
```
