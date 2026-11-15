# Omair

3D films, apps and lessons with Claude Code, using **viz3d** and the **67.js** engine (formerly Crucible) by
[codepawl](https://github.com/codepawl). Both are MIT licensed; their licenses are in `.claude/skills/`.

## What is in this repo

| Path | What |
|---|---|
| `.claude/skills/viz3d`, `.claude/skills/visualize-in-3d` | The viz3d skill and its `/viz3d` command ([codepawl/viz3d](https://github.com/codepawl/viz3d)) |
| `.claude/skills/build-crucible-scene`, `.claude/skills/render-crucible-media` | 67.js skills for building scenes and rendering PNG / MP4 ([codepawl/67.js](https://github.com/codepawl/67.js)) |
| `.mcp.json` + `tools/crucible-mcp.mjs` | The 67.js MCP server (`crucible-scene`). It downloads `@codepawlhq/crucible` through npx on first start. |

Open Claude Code in this folder and everything loads by itself, in a cloud session or on your own PC.

## Use

```text
/viz3d                                   # menu of modes and looks
/viz3d film why your fingers never touch
/viz3d lesson how the heart pumps blood
```

## On your own PC

You need:

- [Node.js](https://nodejs.org) 20.19 or later
- Google Chrome installed (67.js uses it to render)
- [ffmpeg](https://ffmpeg.org/download.html) on your PATH, for video
- [Claude Code](https://code.claude.com)
- Optional: [Blender](https://www.blender.org/download/) 5.x for better models

Then:

```bash
git clone https://github.com/omairfp/omair.git
cd omair
claude
```

Approve the `crucible-scene` MCP server when Claude Code asks. On a PC the launcher uses the GPU and your installed
Chrome. To change that, set these environment variables before starting Claude Code:

| Variable | Default | Use |
|---|---|---|
| `CRUCIBLE_BROWSER` | installed Chrome | Path to another Chrome / Chromium |
| `CRUCIBLE_BACKEND` | `gpu` on a PC, `cpu` in the cloud | `gpu` or `cpu` |
| `CRUCIBLE_MEMORY` | `256` | Render memory in MiB (32 to 384) |
| `CRUCIBLE_VERSION` | `0.20.0` | 67.js package version |

## Updating the skills

```bash
npx skills add codepawl/viz3d
npx skills add codepawl/67.js
```

or copy the newer skill folders over the ones in `.claude/skills/`.
