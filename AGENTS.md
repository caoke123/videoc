# Ecommerce short-video production project

Use `.agents/skills/ecommerce-video-studio/SKILL.md` for product-video planning, original scripts and storyboards, realistic people, category selection, generation, review, and delivery. For seatbelt shoulder pads, also use `.agents/skills/seatbelt-video-studio/SKILL.md` and its product and vehicle constraints. Read the chosen category profile in `production/categories/` before generating images or video.

Production data lives under `production/`. Never overwrite original media in a job's `assets/source/`. Paid DFCine or GPU runs require explicit user confirmation. Review is human-first; AI review and retries happen only on request.

For new H3 jobs, every generated shot must include audible, script-locked native dialogue or off-screen narration to guide performance and mouth movement; final audio may later be replaced. For post-production, use `.agents/skills/ecommerce-video-edit/SKILL.md`: the job remains the source of truth, ClipSkills decides the rough cut, and the primary handoff is an editable Jianying Pro draft. The user imports/opens it in Jianying, performs final fine editing, and manually exports. HyperFrames is optional, not the default assembly tool. Missing shots, voiceover, or uncovered timeline gaps must be reported, never silently removed. Do not call a preview or draft a final delivery before human review.

Voice generation is an external user step using Seed Audio 1.0: prepare a per-shot handoff with exact spoken text, speaker role, emotion, delivery/tone, timing, and target duration; do not call ElevenLabs or another TTS provider unless the user explicitly changes this policy. Import the user's generated audio before subtitle timing and draft assembly.
