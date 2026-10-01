---
name: ecommerce-video-edit
description: Turn approved ecommerce shots and user-generated Seed Audio voiceover into an editable Jianying Pro draft using ClipSkills editorial decisions. Use after generation or when planning post-production.
---

# Ecommerce Video Edit

The job in `production/jobs/<job-id>/` is the source of truth. This skill is category-neutral: read the chosen category profile and product evidence before writing sales text, but do not copy seatbelt-specific claims into other categories.

## Responsibilities

1. **Project orchestration:** read the brief, shot plan, actual rendered files, user-supplied final audio, and review decisions. Preserve originals and their provenance. Write `edit/edit-plan.json` as the editor-neutral editorial contract.
2. **ClipSkills judgment:** read `.agents/skills/clip-skills/SKILL.md` and its relevant references. Decide shot order, trim, pacing, audio/visual alignment, B-roll role, caption wording, and any intentional silence. Ground decisions in the actual source durations. Explicitly record uncovered gaps and missing media; never conceal them by deleting the main track. Do not invent claims.
3. **Jianying rough-cut draft:** use a Jianying Pro-compatible exporter to place approved H3 shots, user-returned Seed Audio, captions, and any approved overlays into a readable, editable rough-cut draft. Follow `production/integrations/jianying-draft-export-assessment.md`. Build into a new isolated job output; never overwrite an existing draft. The handoff is for the user to import/open in Jianying and perform the final fine edit.
   To write the draft, run `scripts/export_jianying_draft.py --job <job dir> --name <new draft name> --exporter <jianying-editor-skill clone>/scripts` (clone commit 32c5692 into a temporary folder and install its requirements in a temporary venv first). It reads `edit/edit-plan.json` (video clips + caption track), refuses to overwrite an existing draft, and never exports a video.
4. **Human finish and export:** the user reviews and fine-cuts the draft in Jianying Pro, then manually exports the final video. Do not attempt UI-driven unattended export or label the rough cut as a final video.
5. **Optional HyperFrames preview:** use only when requested or useful as a temporary technical preview. It is not the default assembly or final delivery path.

## Contract and gates

`edit-plan.json` has `schema_version: 1`, `canvas` (`width`, `height`, `fps`), `duration_seconds`, `shots` (id, path, source_in, start, duration), optional `voiceovers`, `music`, `captions`, `cta`, and `variants`. Paths are relative to the job root; no absolute or parent-traversal paths. All time values are seconds. The builder probes actual media, refuses overlapping or uncovered video, and reports missing optional voiceover. Do not use the builder's `--allow-missing-audio` mode for final delivery.

The user's external Seed Audio file is the final narration source unless the user says otherwise. Probe its duration, verify the spoken wording, and derive caption timing from the actual returned audio—not the prompt's estimated duration. Keep H3 native audio available as provenance/performance reference, but mute it in the final timeline when replacing it. Check the visual performance against the final voice and disclose any lip-sync mismatch.

Keep video shots, final voiceover, captions, music/SFX, and title/CTA on separately editable tracks where the selected exporter supports them. Preserve timing and SKU identity. Package media into the draft or prove stable references so the draft does not go offline when moved. Never overwrite or destructively clean an existing draft. Verify draft structure and a real Jianying open/play/save/reopen cycle before calling the exporter validated. Leave final fine edit and manual MP4 export to the user.

The existing `build_hyperframes.py` and `edit/hyperframes/` outputs remain available for legacy jobs and optional previews; do not route new jobs to HyperFrames by default. A checked plan or draft is not an approved final video.

For a new product category, reuse this contract and create a separate category profile. For new creative formats (product display, story, UGC), change the editorial plan and tests based on actual footage, not this builder's core routing.
