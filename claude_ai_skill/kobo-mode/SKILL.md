---
name: kobo-mode
description: Sends the current chat to the user's Kobo Libra Colour eReader as an EPUB, through the "Rakuten Kobo" folder in Google Drive. Use when the user writes "kobo mode on"; then, while kobo mode is on, when the user sends a message that is only the word "update"; or whenever the user asks to send this chat to Kobo.
---

# Kobo mode

The user reads chats on a Kobo Libra Colour. The Kobo syncs the Google Drive
folder titled **Rakuten Kobo** over Wi-Fi, so an EPUB placed there shows up
in My Books.

## Flow

1. **"kobo mode on"**: reply in one short line, e.g. "Kobo mode on. Jab done
   ho, sirf 'update' likhna." Then continue the conversation normally. Remember
   which message turned kobo mode on: the book starts after it.
2. **A message that is only "update"** while kobo mode is on: do not send yet.
   Ask exactly: "Ye chat Kobo pe bhej doon? Haan ya nahi?"
   If kobo mode is not on, "update" is an ordinary word.
3. **Yes** (haan, ha, han, yes, bhej do, send, ok): build and upload (below),
   then confirm.
4. **Anything else** (nahi, no, or a new question): send nothing and carry on
   with what the user said. Kobo mode stays on, so a later "update" asks again.

The user wants this fully automatic: never ask them to copy, export or share
anything. The only things they type are "kobo mode on", "update" and the answer.

## Checkpoints (long chats)

So that nothing is lost if early messages later drop out of view, save the
chat as it goes. While kobo mode is on, after every **8th** reply since the
last checkpoint, and before writing that reply's answer text:

1. Write the turns not yet saved (word for word, same JSON format as below)
   to a new file in a Google Drive folder titled **Kobo Checkpoints** (find
   it with search; create it in My Drive the first time). Name the file
   `kobo-part-<NN>-<chat title>.json`, NN counting 01, 02, 03 within this chat.
   Upload with `textContent` and `contentMimeType: application/json`,
   `disableConversionToGoogleType: true`. Keep the folder out of Rakuten Kobo.
2. Remember the file ids. Do this quietly: no message to the user about it.

Short chats never reach a checkpoint, and that's fine.

## Build the EPUB

1. Write the chat to `/tmp/kobo/chat.json` as
   `{"title": "<short title for the chat>", "turns": [{"role": "user", "text": "..."}, {"role": "assistant", "text": "..."}, ...]}`.
   - Include every turn after the "kobo mode on" message, up to but not
     including the "update" message. Leave out the kobo-mode messages
     themselves and the confirmation question.
   - Copy the user's messages and your replies **word for word**, in markdown,
     as they appear in the conversation. Do not summarise, shorten or rewrite.
     Leave out tool calls and tool output; keep the text you showed the user.
   - If checkpoints were saved, this file holds only the turns after the last
     checkpoint. Download each checkpoint file from Drive into `/tmp/kobo/`
     (`part-01.json`, `part-02.json`, ...).
   - If early parts of the chat are no longer visible to you in full and no
     checkpoint covers them, say so to the user before building, and include
     what you have.
   - Write the file with a script (e.g. Python `json.dump`) so quotes and
     newlines are escaped correctly.
2. Run the bundled script (it is in this skill's `scripts/` folder; Python 3,
   no packages), listing the parts in order and `chat.json` last:

   ```bash
   python3 <this skill folder>/scripts/kobo_chat.py build /tmp/kobo/part-*.json /tmp/kobo/chat.json --out /tmp/kobo/out
   ```

   (With no checkpoints, pass only `/tmp/kobo/chat.json`.)

   It prints one JSON line with `epub` (path), `bytes` and `sha256`.

## Upload to Google Drive

1. Find the folder with the Google Drive search tool:
   `title = 'Rakuten Kobo' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`.
   Use the one in My Drive. Do not create a new one unless none exists.
2. Get the file as base64: `base64 -w0 "<epub path>"`.
3. Call the Google Drive create/upload file tool with:
   - `title`: the EPUB's file name
   - `parentId`: the folder id
   - `contentMimeType`: `application/epub+zip`
   - `disableConversionToGoogleType`: `true`
   - `base64Content`: the base64 text, complete and unchanged
4. Check the returned `fileSize` equals `bytes`. Then tell the user: "Rakuten
   Kobo folder mein daal di. Kobo pe Sync karo, phir My Books mein khulegi."
5. Only after a successful upload, move this chat's checkpoint files to the
   Drive trash.

## If upload is not possible

If Google Drive is not connected or has no upload tool, or the upload fails:
present the EPUB as a downloadable file and tell the user to save it into the
Rakuten Kobo folder in the Google Drive app, then Sync on the Kobo.
