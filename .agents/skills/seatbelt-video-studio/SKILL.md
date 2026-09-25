---
name: seatbelt-video-studio
description: Plan, prepare, orchestrate, and review batch short-form videos for a seat-belt shoulder-pad product. Use for original ad concepts, viral-reference remixes, scripts, shot plans, character/scene/product images, DFCine canvas nodes, ComfyUI image/video workflows, native model dialogue or optional post TTS, human-first review, on-demand AI diagnosis, and batch production tracking.
---

# Seatbelt Video Studio

Operate the project as a production system. Keep product facts and approved installation references authoritative; use Codex for planning, assets, prompts, DFCine orchestration, and post-production. Use ComfyUI only for selected image/video generation tasks.

## Start

1. Inspect `production/config/project.json` and the selected job under `production/jobs/`.
2. If no job exists, run `scripts/init_batch.py --id <job-id> --mode original|reference|hybrid`.
3. Read only the references needed for the current stage:
   - Pipeline and state transitions: `references/workflow.md`
   - Data files and required fields: `references/schemas.md`
   - DFCine MCP operations: `references/dfcine.md`
   - Product/install constraints: `references/product-safety.md`
   - China left-hand-drive cabin, seat, belt, and camera-orientation rules: `references/vehicle-spatial-rules.md`
   - Image-model benchmark: `references/image-benchmark.md`
   - H3 and reference-video integration: `references/h3-claude-video-integration.md`
4. Never run a paid or GPU workflow without explicit user confirmation. Use `dryRun: true` before DFCine writes, creates, connects, switches, deletes, or group mutations when supported.

## Production Rules

- Support `original`, `reference`, and `hybrid` jobs.
- Do not generate the product installation process. Start product-on-belt shots from a human-approved installed reference.
- Treat real product photos as identity truth. Generated product geometry is not authoritative.
- Keep each video clip to one primary action and one motivated camera move.
- Prefer simple cuts, occlusion cuts, or post-production transitions over complex generated interactions.
- Allow audio per shot: `native`, `post_tts`, or `silent_plate`.
- Prefer H3 `native` audio for short dialogue-led shots when the spoken line is explicit and reviewable; keep subtitles, claims, price, logo, and CTA text as post overlays.
- Default review to `human_first`. Do not run AI quality analysis or retries unless requested.
- Separate preview and final runs. Use low-cost parameters for previews, then promote accepted shots.
- Keep text, price, logo, claims, subtitles, and CTA as post-production overlays unless the user explicitly requests model-rendered text.

## Job Flow

1. **Brief**: record audience, platform, duration, copy, verified claims, prohibited claims, references, and delivery format.
2. **Assets**: place originals in `assets/source/`; never overwrite them. Put approved derived assets in `assets/approved/`.
   - For reference jobs, inspect the source video before writing the shot plan and preserve the analysis beside the job.
3. **Creative**: compile hook, problem/context, reveal, visual proof, installed effect, and CTA.
4. **Shot plan**: write `shot-plan.json`; assign generation mode, references, audio mode, end state, and DFCine workflow for every shot.
5. **Image preparation**: generate characters/scenes and compose approved product references. Run the image benchmark when model choice is unresolved.
6. **DFCine preparation**: inspect workflow guides and actual input labels before writing prompts. Build visible upload/reference/generation nodes and groups.
   - For H3, compile each shot contract into a Ref2VA prompt with explicit reference roles, native audio direction, and a locked installed-product endpoint.
7. **Asset self-check**: before promoting any generated visual, inspect it against the approved product, wearing-reference images, and `references/vehicle-spatial-rules.md`. First identify vehicle left/right, driver/passenger seat, camera direction, belt outboard origin, and inboard buckle; then inspect product geometry and occlusion. Reject severe continuity, geometry, seat-role, belt-routing, perspective, or installation artifacts; record the decision and reason. This check never auto-regenerates and does not replace human approval.
8. **Run**: write prompts and params with dry run, ask for confirmation, run, wait, download, and record result paths.
9. **Human review**: mark `accepted`, `needs_ai_review`, `regenerate`, or `post_fix`.
10. **AI review on request**: inspect only the reported clip/time range; diagnose and propose fixes. Never auto-run the fix.
11. **Post**: assemble accepted clips, optional TTS, subtitles, music, SFX, logo, claims, and CTA.
12. **Validate**: run `scripts/validate_batch.py <job-dir>` before final delivery.

## DFCine Discipline

- Resolve visible titles through `dfcine_list_nodes`; pass UUIDs to node tools.
- Read `dfcine_get_node_agent_guide`, `dfcine_get_node_inputs`, and `dfcine_get_node_params` before prompt writing.
- Treat returned `inputLabel` values as exact truth; never invent or renumber reference tags.
- Use `dfcine_get_node_media_paths` to inspect actual inputs and results.
- Use `dfcine_run_node`, then `dfcine_wait_for_run` or `dfcine_get_run_status`.
- The local ComfyUI status tool does not represent an AutoDL remote connection. Confirm the selected compute provider in DFCine and the chosen workflow runner.
- Save stable production groups as presets only after a successful real job.

## Product Guardrails

- Require at least one approved standalone product image and one approved installed-state image before product video generation.
- Keep belt webbing continuous, flat, untwisted, and visually plausible.
- Do not show opening, wrapping, fastening, repositioning, pulling, or installation.
- Do not claim crash protection, injury reduction, certification, or replacement of the vehicle restraint system unless the user supplies verified evidence and approves the wording.
- If an installed state is uncertain, stop and request human approval rather than inventing it.
- Treat user-supplied wearing-reference images as authoritative for belt routing, shoulder-to-upper-chest placement, pad/belt scale, foreground/background depth, and plausible human posture. They do not override the target SKU's approved product-identity image.
- Every generated asset must pass the asset self-check before promotion: the belt must visibly enter and exit the pad along one continuous centerline; the pad must sit on the shoulder-to-upper-chest belt segment; the pad/plush assembly must not float, penetrate the body, cross unrelated car parts, duplicate, detach, or receive impossible occlusion; faces, hands, and vehicle geometry must have no severe artifacts.

## Image Strategy

- Use fast local T2I models for composition exploration and bulk candidates.
- Use GPT-Image2 or the best validated editor for difficult final composites.
- Benchmark T2I and multi-reference editing separately; evaluate usable-output time, not only raw latency.
- Do not promote an image to `assets/approved/` without human approval.
