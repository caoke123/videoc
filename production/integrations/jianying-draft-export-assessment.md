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
