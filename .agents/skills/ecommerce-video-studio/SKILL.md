---
name: ecommerce-video-studio
description: Create original, realistic ecommerce UGC short videos across product categories, from brief and product evidence through script, character, scene, storyboard, generation, review, and delivery. Use for new video batches and category-specific production planning.
---

# Ecommerce Video Studio

Create a complete video from the product brief even when no reference video exists. A reference video is optional inspiration. Read `production/config/project.json`, `production/config/categories.json`, and the selected category profile before planning. The category profile supplies product and scene constraints; the provider supplies generation. Do not infer product facts or claims from the category name.

For every new video request, follow `production/workflows/standard-video-production.md`: evidence/brief → script and shot breakdown → minimum required asset package → one batch preflight and authorized generation → review. Determine assets from each shot's depicted product state, action, claim, and provider input needs. A scene name (desk, car, 4S showroom, cultural store, or another location) does not by itself require a particular reference or approval. References, storyboards, and reusable composites are optional outputs. Infinite Canvas automatically projects the prepared job and adds no manual layout or approval gate.

For new AutoDL jobs, keep shot identity, order, timing, and references only in `shot-plan.json`. The runner derives those fields into a `request-plan.json` marked `derived_from: "shot-plan"`; that file owns submission fields such as final prompt, seed, workflow, resolution, and published audio URL. Batch and single-shot submission both sync and validate before sending. Old jobs without the marker are checked for drift but are not rewritten. Each task has one editable view in “我的画布”; the task page shows status, submission, audio publication, review, and accepted-shot composition. Deleting a task shot node only hides it until the next task sync.

## Start a job

Use `scripts/init_batch.py --id <job-id> --category <category-id> --mode original|reference|hybrid`. The category must exist in `production/config/categories.json`. `original` is the default. Existing jobs without `category_id` remain legacy seatbelt jobs; do not rewrite them just to adopt the new structure.

## Original creative path

Read [creative-workflow.md](references/creative-workflow.md) when creating a concept, script, role, scene, action, or shot plan. Derive these from audience, use occasion, verified selling points, product appearance, and platform. Produce several distinct hook and story options on paper, choose one for the brief, then write spoken lines, character profile, scene, actions, and shot contracts. The process must work without a competitor video, user-written script, or supplied model portrait. Any missing product truth remains a question or an explicitly unverified field, not an invented claim.

Read [seedance-prompt-techniques.md](references/seedance-prompt-techniques.md) for timed scene-breakdown phrasing, UGC/handheld vocabulary, lip-sync/breath-sync wording, layered sound description, reference-image inherit/non-inherit locking, and the UGC product-review person-lock/product-lock split — worth reusing in `shot-plan.json` dialogue, camera/audio, and `reference_roles` fields. Techniques only, never copy a source prompt verbatim, and never import syntax or constraints specific to another platform's pipeline.

Read [realistic-characters.md](references/realistic-characters.md) before generating or reviewing people. Keep person, environment, product, movement, lighting, and camera behavior physically consistent. Use subtle human irregularities and suitable photographic imperfections, not an artificial checklist of defects.

Before video generation, prepare a per-shot external voice prompt package using [seed-audio-handoff.md](references/seed-audio-handoff.md): exact copy, speaker role, emotion, tone/delivery, accent, timing, and target duration. Preserve user sources; save optional references, storyboards, or reusable assets only when a shot needs them. Do not create empty registers, placeholder images, or approved copies solely to advance a status. The Infinite Canvas view derives nodes and reference edges from actual job files. The user generates the final audio outside Codex and returns it for editing; do not call ElevenLabs or another TTS provider under the current project policy.

Every MiniMax H3 shot must contain audible native dialogue or off-screen narration with the exact shot-locked text, even when that generated audio will later be replaced. This is required to guide performance and mouth movement. Every shot has a purpose, one primary action, a feasible camera position/move, reference roles, audio plan, and end state. Generate or source a keyframe only when composition, continuity, physical interaction, or provider input requires one. Keep source files intact. Self-check and obtain human approval before promoting a generated image to authoritative reusable asset status; an ephemeral composition guide can remain a candidate and be reviewed with the batch. Human review precedes optional AI review or retries. Keep claims, subtitles, price, logo, and CTA as post overlays unless the user asks otherwise.

## SKU registration

A recurring product can be registered as a `sku.json` in its library folder, carrying identity, per-SKU plush geometry and the approved installed-state ratios; a one-off product needs no registration (leave `product_sku_id` empty and use the user's photo). Read [sku-registration.md](references/sku-registration.md) before registering a SKU, and whenever the user names a product, person, scene or material from the 素材库: resolve it through `GET /api/library/entities/resolve?q=<name or alias>` to get its references with roles and its generated lock paragraph, rather than assembling them by hand.

## Category and execution routing

- For `seatbelt-shoulder-pad`, read the category profile and `.agents/skills/seatbelt-video-studio/SKILL.md` for installation, vehicle geometry, and SKU identity rules.
- For `bag-charm`, read its category profile. Require the actual SKU image and attachment evidence before depicting the charm attached to a bag. Keep material, scale, hardware, and attachment behavior faithful to approved evidence.
- For another category, create its profile and catalog entry first. Define its source-of-truth assets, identity features, physical use, prohibited depictions, claim limits, and acceptance checks. Avoid inheriting seatbelt rules.
- Generation goes through the local runner (`autodl-video-workbench/local-runner.mjs`) to AutoDL H3; it is the only submitter and holds the token. The seatbelt skill's `references/dfcine.md` and `references/h3-claude-video-integration.md` describe the legacy DFCine route, kept only for old jobs; they are execution adapters, not category rules.

Plan, prompts, previews, and cost estimates can be prepared locally. Follow `AGENTS.md`: paid generation (AutoDL via the runner, or legacy DFCine/GPU runs) requires explicit user confirmation once for the named batch of shots; for material-sensitive products submit one shot first (`submit-batch` with `mode: "probe"`), review it, then submit the rest. If storyboard candidates were made, combine them into one contact sheet for that review; do not request separate approval for every intermediate image that is not being promoted as product truth. Record model/provider, prompt version, references, time, cost, result, and review decision. A successful AutoDL shot remains pending human review until its current task ID has an accepted or rejected decision; a new run needs a new decision, and only accepted current runs enter the rough cut. Validate the job with `scripts/validate_batch.py <job-dir>` before delivery.

## Post-production handoff

After approved shots and the user's Seed Audio file are available, route to `.agents/skills/ecommerce-video-edit/SKILL.md`. Keep this studio skill responsible for product truth, creative intent, provider execution, and shot review; the edit skill owns the cut plan, audio/caption timing, Jianying Pro draft, and draft verification. HyperFrames is an optional preview path, not the default final compositor. Do not label a checked draft or preview as a final video.
