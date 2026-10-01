---
name: infinite-canvas-json-build
description: Build or replace an entire Infinite Canvas project (nodes, connections, video prompts, layout) in one shot by writing a JSON document and PATCHing it to the local runner, instead of issuing one canvas_apply_ops call per node. Use whenever a full storyboard/canvas needs to be constructed from a script or an existing job, not for incremental edits to a canvas someone has open.
---

# Infinite Canvas: build a canvas from a JSON document

Building a canvas node-by-node (one `canvas_apply_ops`/`canvas_create_*` call per node, per connection) works but is slow and error-prone for anything beyond a few nodes. The web app's own "导出画布" already produces a `projects.json` whose `project` object is the *exact* on-disk shape (`production/canvases/<id>.json`) that the local runner serves. Writing that shape directly and PATCHing it in is dramatically faster: two HTTP calls build a whole storyboard instead of dozens of tool calls.

**Prerequisite**: `autodl-video-workbench/local-runner.mjs` must be running (`curl http://127.0.0.1:4173/api/health`). Requests below use `127.0.0.1:4173` directly; from inside the web app's own origin, the same paths work through the Vite proxy at `127.0.0.1:4400/api/...`.

## When to use this vs. the node-by-node tools

- **Use this (JSON + PATCH)** when authoring a new canvas from a script/shot list, or re-creating/cloning an exported canvas — anything that's "build the whole thing once."
- **Use `canvas_apply_ops` / `canvas_insert_image_nodes` / `workbench_image_generate` with `target`** when editing a canvas a user (or another Agent) currently has open — those go through the live SSE-broadcast path so other viewers see the change immediately and your own client's optimistic state doesn't fight a bulk overwrite. A raw PATCH also touches the canvas even if someone has it open (they'll receive the update via SSE like any other edit), but it replaces the fields you send wholesale, so don't PATCH `nodes`/`connections` from stale data you fetched a while ago — always PATCH from a payload you just built or a project you just GETed.

## The recipe

1. **Create** (or reuse an existing id):
   ```bash
   curl -X POST http://127.0.0.1:4173/api/canvases \
     -H "Content-Type: application/json" \
     -d '{"title":"镜头脚本标题"}'
   # -> { "id": "<uuid>", ... }
   ```
2. **Write the full body** in one PATCH:
   ```bash
   curl -X PATCH http://127.0.0.1:4173/api/canvases/<id> \
     -H "Content-Type: application/json" \
     --data-binary @canvas.json
   ```
   `canvas.json` only needs the fields you're setting — omitted fields keep their current value (see `PROJECT_FIELDS` in `autodl-video-workbench/canvas-store.mjs`): `title`, `nodes`, `connections`, `chatSessions`, `activeChatId`, `backgroundMode`, `showImageInfo`, `viewport`.

For large bodies, always write the JSON to a file and `--data-binary @file` — don't try to inline Chinese text and nested quotes into a shell `-d` string.

## Node shape

Every node: `{ id, type, title, position: {x, y}, width, height, metadata }`. `type` is one of `image | video | audio | text | config`.

- **Image node**: `metadata.content` = image URL (`/api/library/files/<path>` for shared library assets — prefer this for anything reusable across jobs; `/api/jobs/<jobId>/files/<path>` for a specific job's own assets), plus `status:"success"`, `naturalWidth`, `naturalHeight`, `bytes`, `mimeType`.
- **Video node (a shot)**: `metadata.prompt` (the actual generation prompt, English, one shot = one prompt), `seconds`, `videoMode` ("reference" for multi-reference mode), and once rendered, `content` (the rendered file URL) + `status:"success"` + `mimeType:"video/mp4"`. A shot with no `content` yet is just a prompt waiting to be generated.
- **Audio node**: `metadata.content` = audio URL (remote `https://...` or a job file path), `status:"success"`, `mimeType:"audio/mpeg"`.
- **Final/compose node**: same as a video node, used for a rough-cut/preview output that several shots feed into.

## Id and layout conventions (match what the app's own export produces)

- Reference images: `asset:<original ref>` (e.g. `asset:library:products/<sku>/source/product-front.png`, `asset:assets/approved/<...>.png`).
- Shots: `shot-<shotId>` (e.g. `shot-S01`).
- Composed finals: `final:<output path>`.
- Audio: `audio:<url>`.
- Typical layout: reference images stacked in a left column (`x:0`, increasing `y`), shots in a middle column (`x:420`), finals in a right column (`x:920`). Not required, just keeps things readable.

## Connections

`{ id, fromNodeId, toNodeId }` — every reference image/audio a shot uses gets one edge into that shot's node id; every shot a final was cut from gets one edge into the final's node id. `id` just needs to be unique within the canvas (`edge:<anything>` is fine).

## Worked example

A real exported canvas (11 reference images, 4 audio clips, 4 shots with full English prompts, 2 finals, 34 connections) was round-tripped through exactly this recipe in one create + one PATCH — see chat history around 2026-09-30 for the full JSON if you need a concrete template to copy the shape from.

## Not yet wired into the in-app canvas Agent

This recipe uses local-runner's plain HTTP API directly — any agent with shell/HTTP access (Codex CLI, Claude Code, a script) can use it today. The canvas-agent bridge (Codex talking through the browser's "连接本地 Agent" panel) does **not** have a tool that wraps this yet — it only has the node-by-node tools (`canvas_apply_ops`, `canvas_insert_image_nodes`, `workbench_image_generate`). Adding a `canvas_import_json`-style tool there is a reasonable follow-up if bulk-building from inside a live Agent chat turns out to matter as much as doing it from a shell.
