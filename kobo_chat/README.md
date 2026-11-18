# kobo_chat

Turns a Claude Code chat into an EPUB for a Kobo eReader. Python 3 only, no packages.

```bash
python3 kobo_chat/kobo_chat.py export                       # whole current session
python3 kobo_chat/kobo_chat.py export --since "kobo mode on" # from the trigger onward
python3 kobo_chat/kobo_chat.py export --title "Pharma notes" --out ./kobo_out
```

The EPUB has a title page, a table of contents with one chapter per question,
and only the chat text (no tool calls). A final message of just `update` and
everything after it is left out.

In a Claude session the `kobo-send` skill (`.claude/skills/kobo-send/SKILL.md`)
uploads the EPUB to the `Rakuten Kobo` folder in Google Drive, and the Kobo
picks it up on its next sync. On a PC you can instead copy the file to the
Kobo over USB.

Workflow: say `kobo mode on` at the start, `update` at the end, then `haan`.
