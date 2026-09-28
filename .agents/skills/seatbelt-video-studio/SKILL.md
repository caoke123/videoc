---
name: seatbelt-video-studio
description: Apply approved SKU identity, correct installation, realistic vehicle geometry, and DFCine/H3 guidance to seat-belt shoulder-pad short videos. Use alongside ecommerce-video-studio for this category.
---

# Seatbelt Video Studio

Use this as the `seatbelt-shoulder-pad` category supplement to `ecommerce-video-studio`. Keep product facts and approved installation references authoritative; use Codex for planning, assets, prompts, DFCine orchestration, and post-production. Use ComfyUI only for selected image/video generation tasks. For people, apply the shared realistic-character guidance at `../ecommerce-video-studio/references/realistic-characters.md`.

## Start

1. Inspect `production/config/project.json`, the category profile, and the selected job under `production/jobs/`.
2. If no job exists, run `../ecommerce-video-studio/scripts/init_batch.py --id <job-id> --category seatbelt-shoulder-pad --mode original|reference|hybrid`.
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

- Support `original`, `reference`, and `hybrid` jobs. For an original job, develop the hook, script, role, scene, actions, and shot plan without depending on an outside reference video.
- Do not generate the product installation process. Start product-on-belt shots from a human-approved installed reference.
- Treat real product photos as identity truth. Generated product geometry is not authoritative.
- Keep each video clip to one primary action and one motivated camera move.
- Prefer simple cuts, occlusion cuts, or post-production transitions over complex generated interactions.
- Every new MiniMax H3 shot must use native audio and contain the exact spoken dialogue or off-screen narration, even when post will replace that audio. Do not plan a silent H3 plate.
- Prepare a per-shot Seed Audio 1.0 handoff (exact text, speaker role, emotion, tone/delivery, timing, duration) for the user to generate externally; do not call ElevenLabs under the current project policy.
- Default review to `human_first`. Do not run AI quality analysis or retries unless requested.
- Separate preview and final runs. Use low-cost parameters for previews, then promote accepted shots.
- Keep text, price, logo, claims, subtitles, and CTA as post-production overlays unless the user explicitly requests model-rendered text.

## Job Flow

Follow the shared ordered phases in `production/workflows/standard-video-production.md`; this category profile adds the following gates without changing their order:

1. **Evidence and brief**: confirm SKU identity, source product photo, installed-state reference for every installed depiction, audience, platform, duration, copy, verified/prohibited claims, and delivery format. Inspect a reference video before writing a shot plan when the job is `reference` or `hybrid`.
2. **Script and shot breakdown**: write the concepts, selected hook, exact dialogue, character/scene/action contracts, timing, and `shot-plan.json` before visual generation.
3. **Minimum asset package**: preserve originals in `assets/source/`; attach only references actually needed by a shot or provider. The scene alone does not decide the gate: a car interior, 4S showroom, store, or desk may show a standalone, handheld, or installed product. Require an approved installed-state reference for the exact SKU only when the shot depicts it installed or worn on a belt. Generate a keyframe only for uncertain composition, physical interaction, continuity, or provider input needs. Create reusable composites only when needed; candidates stay in `assets/generated/` until promotion.
4. **Prompt and batch preflight**: read the actual workflow inputs and compile each shot with explicit reference roles and native audio direction. Check source identity, depicted product state, claims, reference order, paths, duration, and workflow once for the batch. For an installed depiction, apply `references/vehicle-spatial-rules.md` and verify seat, belt route, pad placement, scale, and occlusion against the approved installed reference. For a car scene with no installed product, check only the vehicle details visible and relevant to that shot. Do not impose vehicle geometry checks on unrelated scenes.
5. **Approval boundary**: self-check and obtain human approval before promoting a generated image to authoritative SKU, installed-state, or other reusable reference status. Ephemeral storyboard/composition guides remain labeled candidates and can be viewed in one batch review; they do not each require separate approval or a duplicate approved copy. Paid/GPU generation starts only after explicit authorization for the named batch. Infinite Canvas automatically shows actual assets and results; it adds no layout or placeholder gate.
6. **Run**: Agent or a human may submit the prepared batch; both routes use the same logged provider path. Wait, download, and record result paths without overwriting prior runs.
7. **Human review**: mark `accepted`, `needs_ai_review`, `regenerate`, or `post_fix`.
8. **AI review on request**: inspect only the reported clip/time range; diagnose and propose fixes. Never auto-run the fix.
9. **Post and validate**: import the user's Seed Audio file, align captions to its actual timing, and assemble accepted clips and editable overlays in a Jianying Pro draft. Keep H3 native audio in source files but mute it in the final mix when replaced. Run `../ecommerce-video-studio/scripts/validate_batch.py <job-dir>` before final delivery.

## DFCine Discipline (legacy jobs only)

New jobs do not use DFCine: they submit through the local runner to AutoDL (`production/workflows/standard-video-production.md`). This section applies only when reproducing or continuing an old DFCine job.

- Resolve visible titles through `dfcine_list_nodes`; pass UUIDs to node tools.
- Read `dfcine_get_node_agent_guide`, `dfcine_get_node_inputs`, and `dfcine_get_node_params` before prompt writing.
- Treat returned `inputLabel` values as exact truth; never invent or renumber reference tags.
- Use `dfcine_get_node_media_paths` to inspect actual inputs and results.
- Use `dfcine_run_node`, then `dfcine_wait_for_run` or `dfcine_get_run_status`.
- The local ComfyUI status tool does not represent an AutoDL remote connection. Confirm the selected compute provider in DFCine and the chosen workflow runner.
- Save stable production groups as presets only after a successful real job.

## Product Guardrails

- Require an approved standalone product image for every depicted SKU. Require an approved installed-state image for that SKU only when a shot depicts the product installed or worn on a belt. A desk, car, showroom, or store scene showing the SKU separately or handheld does not need an installed-state reference.
- Keep belt webbing continuous, flat, untwisted, and visually plausible.
- Do not show opening, wrapping, fastening, repositioning, pulling, or installation.
- Do not claim crash protection, injury reduction, certification, or replacement of the vehicle restraint system unless the user supplies verified evidence and approves the wording.
- If an installed state is uncertain, stop and request human approval rather than inventing it.
- Treat user-supplied wearing-reference images as authoritative for belt routing, shoulder-to-upper-chest placement, pad/belt scale, foreground/background depth, and plausible human posture. They do not override the target SKU's approved product-identity image.
- Before a generated installed-state image is promoted to an authoritative reference, check that the belt visibly enters and exits the pad along one continuous centerline; the pad sits on the shoulder-to-upper-chest belt segment; and the assembly does not float, penetrate the body, duplicate, detach, or receive impossible occlusion. Check faces, hands, and vehicle geometry when visible. For other generated authoritative assets, check only the facts and relationships they will establish.

## Image Strategy

- Use fast local T2I models for composition exploration and bulk candidates.
- Use GPT-Image2 or the best validated editor for difficult final composites.
- Benchmark T2I and multi-reference editing separately; evaluate usable-output time, not only raw latency.
- Do not promote an image to `assets/approved/` without human approval.
