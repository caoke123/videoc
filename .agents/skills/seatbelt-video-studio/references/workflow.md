# Production workflow

## States

`draft -> minimum_assets_ready -> batch_preflight -> ready_for_video -> generating -> human_review -> postproduction -> delivered`

Do not skip final human review. Add `asset_self_check -> human_asset_approval` only for a generated image being promoted to an authoritative reusable SKU, installed-state, or other truth reference; record pass/fail and do not auto-retry. Candidate keyframes and composition guides do not need their own approval state. AI review is optional and initiated only after the user flags a problem. The setting never selects a gate by itself; the depicted product state, action, and claim do.

## Creative modes

- `original`: derive concept, hook, script, role, scene, actions, keyframes, and shot plan from the product brief and verified facts. No reference video or prewritten script is required; use `ecommerce-video-studio/references/creative-workflow.md`.
- `reference`: deconstruct an observed video, then apply a layer contract.
- `hybrid`: retain selected hook/rhythm/camera functions while using original copy, character, product, scene, and CTA.

## Example 15-second architecture

| Time | Function | Preferred generation |
|---|---|---|
| 0-3s | selfie/dialogue hook | character I2V or native audiovisual model |
| 3-5s | standalone product reveal | product I2V or post push-in |
| 5-6s | hard/occlusion/flash transition | post-production |
| 6-11s | already-installed effect | installed-reference I2V |
| 11-13s | detail or visual proof | product/installed I2V |
| 13-15s | packshot and CTA space | still motion/post |

Adjust duration to the copy. Do not force all functions into every ad.

## Compute policy

Prepare copy, prompts, references, shot JSON, and preview frames before paid GPU time. Batch compatible runs while one model remains loaded. Record cold-start and warm-run time separately. Stop remote compute after downloads complete.
