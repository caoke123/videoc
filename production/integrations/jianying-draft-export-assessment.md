# Jianying Pro draft-export skill assessment

## Decision

Use ClipSkills for editorial judgment and keep `edit/edit-plan.json` as the editor-neutral source of truth. The primary handoff is an editable Jianying Pro rough-cut draft. The user completes the fine edit and manually exports the final video. HyperFrames remains an optional preview/legacy route; UI-driven unattended export is not part of the workflow.

## Local validation: luoluoluo22 (2026-09-26)

- Checked out `luoluoluo22/jianying-editor-skill` at commit `32c56928ded4f9e2c2b80e099dc7abb793d2c30b` into a system temporary test folder; installed its declared dependencies only in a temporary Python 3.12 virtual environment.
- Its 19 repository tests passed. Its API diagnostic generated `CodexSkillTest_20260926_01` in the real Jianying draft root. The diagnostic defaults to `overwrite=True`; the test used a unique name and confirmed the target did not already exist.
- Jianying 11.5 opened and played the generated draft; the user confirmed playback and provided a screenshot showing the subtitle/text track. The user then confirmed closing/restarting Jianying and reopening the draft works. Draft inspection found 2 tracks and 9 timeline segments. Media was staged under the draft's own `materials/` directory and all referenced files exist.
- The test clip is only a sample asset from the skill repository, not approved product footage. No final video was exported. The media was copied into the draft's own `materials/` folder, so the test draft does not depend on the temporary checkout.
- The skill's own platform note says its UI-driven auto-export is most stable on Jianying 5.9 or earlier. Since the production workflow now explicitly leaves final fine editing/export to the user, do not invoke its automated exporter on this Jianying 11.5 setup.

## Candidate landscape reviewed

- `DogeCoding/capcut-skill`: a small workflow around `pyJianYingDraft` and subtitle/draft helpers. Documentation is Mac-oriented with Windows adaptation notes; confirm current Windows support, Jianying version compatibility, maintenance, and license before adoption.
- `YGtemple/jianying-editor-skill`: broad draft JSON and UI workflow, but repository maturity/activity evidence was limited at review time. Treat as research, not a trusted drop-in.
- `luoluoluo22/jianying-editor-skill`: documents Windows and macOS draft generation; UI-driven export is reported as version-sensitive, with stability claims centered on Jianying 5.9 or earlier. Confirm current installed version and test behavior locally.
- `maxazure/video-editing-skill`: includes an explicit CapCut/Jianying draft exporter and multi-track output; inspect only the exporter component if selected. Absolute media paths may go offline when moved; its bundled workflow/TTS policy must not override this project's Seed Audio handoff.
- `mcncarl/jianying-headless`: native editable draft engine is macOS-focused; its documented Windows route renders with FFmpeg rather than producing the native draft, and its stated non-commercial license is not suitable for this commercial production project.
- `codex-jianying-draft-cover`: handles cover metadata for an existing Jianying 5.9 draft, not timeline assembly; not a core exporter.

Repository references: [DogeCoding/capcut-skill](https://github.com/DogeCoding/capcut-skill), [YGtemple/jianying-editor-skill](https://github.com/YGtemple/jianying-editor-skill), [luoluoluo22/jianying-editor-skill](https://github.com/luoluoluo22/jianying-editor-skill), [maxazure/video-editing-skill](https://github.com/maxazure/video-editing-skill), [mcncarl/jianying-headless](https://github.com/mcncarl/jianying-headless), [codex-jianying-draft-cover](https://github.com/cxch51507202/codex-jianying-draft-cover).

## Adoption gate

Before integrating any exporter:

1. Read its source, license, dependency behavior, and media-path strategy; reuse only the narrow draft-writing adapter, not unrelated TTS or cloud calls.
2. Record the installed Jianying Pro version and actual draft root without changing either.
3. Generate a disposable draft in a new isolated test folder from a short approved job with one H3 clip, one returned Seed Audio file, and one caption track. The sample diagnostic draft is not a substitute for this product-media test.
4. Open in Jianying, check video/audio/caption timing, save, close, reopen, and verify media remains online. This basic round-trip has passed for the current diagnostic draft; repeat with approved H3/Seed Audio media during the first real production batch.
5. The user performs final fine edit and manual export in Jianying. Automated MP4 export is explicitly out of scope.
6. Keep a rollback copy and never overwrite existing drafts.

## First real-job draft (2026-10-01)

- Job `canvas-85113607-8e34-4fce-9571-3fd928f49412` (帕恰狗粉格围兜款，4 个已通过审片的 H3 镜头)。`edit/edit-plan.json` 用 ffprobe 的实际时长（4.458 秒/镜，合计 17.83 秒，超过计划的 13 秒；草稿保留完整时长由用户精剪）。
- 适配脚本 `.agents/skills/ecommerce-video-edit/scripts/export_jianying_draft.py` 只读 `edit-plan.json`，调用同一提交 `32c5692…` 的 `luoluoluo22/jianying-editor-skill`（MIT）的草稿写入接口，强制 `overwrite=False`，目标草稿名已存在则拒绝。导出库装在临时 venv，不进项目依赖。
- 生成草稿 `帕恰狗_主驾分享_粗剪测试_20261001`：1080×1920，视频轨 4 段（0 / 4.46 / 8.92 / 13.37 秒），字幕轨 4 条（分镜对白，标记为待按配音校对），保留 H3 原生音轨；素材未转码，原样复制进草稿 `materials/`。
- 草稿主文件是旧格式 `draft_info.json`；9 月 26 日那份已确认能打开的测试草稿在剪映 11.5 打开后被转成了新目录结构（`Timelines/` 等），说明剪映会自动转换。本次草稿的剪映内打开、保存、关闭重开仍待用户确认。
- 未接入剪映的自动导出，成片由用户在剪映里手动导出。

## Task-page export button (2026-10-01)

- 任务页「导出剪映草稿」调用本机执行器 `GET/POST /api/jobs/<id>/jianying-export`（`autodl-video-workbench/jianying-export.mjs`）：审片全部完成（无待审镜头）才可用；只取已通过审片的当前版本；顺序和字幕可在弹窗里调整；写 `edit/edit-plan.json`（上一份留作 `edit-plan.prev.json`），再调用适配脚本，结果记入运行日志 `jianying_draft_exported`。
- 导出组件由 `autodl-video-workbench/scripts/setup-jianying-exporter.mjs` 安装到 `tools/jianying-exporter/`（git 忽略：固定到提交 32c5692 的克隆 + 独立 Python 3.12 venv）。环境变量 `JIANYING_EXPORTER_DIR` 可改安装位置，`JIANYING_DRAFTS_ROOT` 可改草稿目录（默认剪映标准目录）。
