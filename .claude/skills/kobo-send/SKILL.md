---
name: kobo-send
description: Send this session's chat to the user's Kobo Libra Colour as an EPUB via the "Rakuten Kobo" Google Drive folder. Use when the user says "kobo mode on", when kobo mode is on and the user sends the single word "update", or when the user asks to send the chat to Kobo.
---

# Kobo send

The user reads chats on a Kobo Libra Colour. The Kobo syncs the Google Drive
folder titled **Rakuten Kobo** over Wi-Fi. This skill turns the session
transcript into an EPUB and uploads it there.

## Flow

1. **Start: "kobo mode on".** Reply in one line that kobo mode is on and that
   the user should send "update" when done. Remember this for the session.
2. **End: the user sends just "update"** (the whole message, nothing else) and
   kobo mode is on. Do not send yet. Ask exactly one question:
   "Ye chat Kobo pe bhej doon? Haan ya nahi?"
   If kobo mode is not on, "update" is an ordinary word: treat it normally.
3. **Answer is yes** (haan, ha, yes, bhej do, send, ok): run the export and
   upload below, then confirm with the book title.
4. **Anything else** (nahi, no, or a new question/topic): send nothing, and
   carry on with whatever the user said. Kobo mode stays on, so a later
   "update" asks again.

## Export and upload

1. Build the EPUB from the repository root:

   ```bash
   python3 kobo_chat/kobo_chat.py export --since "kobo mode on" \
     --out "<scratchpad>/kobo_out" [--title "<short title>"]
   ```

   It prints one JSON line with `epub` (absolute path) and `sha256`. The script
   keeps only the user's messages and Claude's replies (no tool calls), starts
   after the last "kobo mode on" message, and stops before the last "update",
   so the confirmation exchange is left out. Without `--since` it exports the
   whole session. Pass `--title` when the AI session title doesn't fit.

2. Find the folder with Google Drive `search_files`:
   `title = 'Rakuten Kobo' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
   (use the one in My Drive). Never hardcode its id.

3. Upload with Google Drive `create_file`:
   - `title`: the file name of the EPUB (basename of `epub`)
   - `parentId`: the folder id
   - `contentMimeType`: `application/epub+zip`
   - `disableConversionToGoogleType`: `true`
   - `base64Content`: the file reference `sha256:<sha256>:<epub absolute path>`

4. Check the returned `fileSize` equals the `bytes` from step 1. Tell the user
   it's in the Rakuten Kobo folder and that on the Kobo they tap
   **Sync** (or wait for auto-sync), then open it from My Books.

## If something fails

- Google Drive not connected: say so and offer the Gmail route or USB copy
  (the EPUB is still in the scratchpad).
- No transcript found: the script exits with a message; report it as is.
