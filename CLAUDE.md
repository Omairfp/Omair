# Notes for Claude

## Kobo mode

- If the user says **"kobo mode on"**, load the `kobo-send` skill and follow it.
- While kobo mode is on, a message that is only **"update"** means the session
  is ending: ask "Ye chat Kobo pe bhej doon? Haan ya nahi?" before sending
  anything. Send only on a yes; on anything else, send nothing and continue
  the chat.
- The tool is `kobo_chat/kobo_chat.py` (Python 3, no dependencies).
