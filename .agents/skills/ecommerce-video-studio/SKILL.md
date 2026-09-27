---
name: ecommerce-video-studio
description: Create original, realistic ecommerce UGC short videos across product categories, from brief and product evidence through script, character, scene, storyboard, generation, review, and delivery. Use for new video batches and category-specific production planning.
---

# Ecommerce Video Studio

Create a complete video from the product brief even when no reference video exists. A reference video is optional inspiration. Read `production/config/project.json`, `production/config/categories.json`, and the selected category profile before planning. The category profile supplies product and scene constraints; the provider supplies generation. Do not infer product facts or claims from the category name.

## Start a job

Use `scripts/init_batch.py --id <job-id> --category <category-id> --mode original|reference|hybrid`. The category must exist in `production/config/categories.json`. `original` is the default. Existing jobs without `category_id` remain legacy seatbelt jobs; do not rewrite them just to adopt the new structure.

## Original creative path

Read [creative-workflow.md](references/creative-workflow.md) when creating a concept, script, role, scene, action, or shot plan. Derive these from audience, use occasion, verified selling points, product appearance, and platform. Produce several distinct hook and story options on paper, choose one for the brief, then write spoken lines, character profile, scene, actions, and shot contracts. The process must work without a competitor video, user-written script, or supplied model portrait. Any missing product truth remains a question or an explicitly unverified field, not an invented claim.

Read [realistic-characters.md](references/realistic-characters.md) before generating or reviewing people. Keep person, environment, product, movement, lighting, and camera behavior physically consistent. Use subtle human irregularities and suitable photographic imperfections, not an artificial checklist of defects.

Before video generation, prepare a per-shot external voice prompt package using [seed-audio-handoff.md](references/seed-audio-handoff.md): exact copy, speaker role, emotion, tone/delivery, accent, timing, and target duration. The user generates the final audio outside Codex and returns it for editing; do not call ElevenLabs or another TTS provider under the current project policy.

Every MiniMax H3 shot must contain audible native dialogue or off-screen narration with the exact shot-locked text, even when that generated audio will later be replaced. This is required to guide performance and mouth movement. Every shot has a purpose, one primary action, a feasible camera position/move, reference roles, audio plan, and end state. Generate or source approved keyframes before video generation. Keep source files intact; generated assets pass a self-check and human approval before promotion. Human review precedes optional AI review or retries. Keep claims, subtitles, price, logo, and CTA as post overlays unless the user asks otherwise.

## Category and execution routing

- For `seatbelt-shoulder-pad`, read the category profile and `.agents/skills/seatbelt-video-studio/SKILL.md` for installation, vehicle geometry, and SKU identity rules.
- For `bag-charm`, read its category profile. Require the actual SKU image and attachment evidence before depicting the charm attached to a bag. Keep material, scale, hardware, and attachment behavior faithful to approved evidence.
- For another category, create its profile and catalog entry first. Define its source-of-truth assets, identity features, physical use, prohibited depictions, claim limits, and acceptance checks. Avoid inheriting seatbelt rules.
- Choose a video provider per job or shot. Current DFCine/H3 guidance is in the seatbelt skill's `references/dfcine.md` and `references/h3-claude-video-integration.md`; those are execution adapters, not category rules. Do not assume a self-hosted H3 Gateway is deployed until verified.

Plan, prompts, previews, and cost estimates can be prepared locally. Follow `AGENTS.md`: paid DFCine or GPU runs require explicit user confirmation. Record model/provider, prompt version, references, time, cost, result, and review decision. Validate the job with `scripts/validate_batch.py <job-dir>` before delivery.

## Post-production handoff

After approved shots and the user's Seed Audio file are available, route to `.agents/skills/ecommerce-video-edit/SKILL.md`. Keep this studio skill responsible for product truth, creative intent, provider execution, and shot review; the edit skill owns the cut plan, audio/caption timing, Jianying Pro draft, and draft verification. HyperFrames is an optional preview path, not the default final compositor. Do not label a checked draft or preview as a final video.
