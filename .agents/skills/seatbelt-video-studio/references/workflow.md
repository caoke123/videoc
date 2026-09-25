# Production workflow

## States

`draft -> assets_pending -> storyboard_pending -> images_pending -> asset_self_check -> human_asset_approval -> ready_for_video -> generating -> human_review -> ai_review_requested -> postproduction -> delivered`

Do not skip `human_review` or `human_asset_approval`. Asset self-check is mandatory for each generated visual before it can be promoted; it records pass/fail and does not auto-retry. AI review is optional and initiated only after the user flags a problem.

## Creative modes

- `original`: derive the full film from the user's copy and brief.
- `reference`: deconstruct an observed video, then apply a layer contract.
- `hybrid`: retain selected hook/rhythm/camera functions while using original copy, character, product, scene, and CTA.

## Default 15-second architecture

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
