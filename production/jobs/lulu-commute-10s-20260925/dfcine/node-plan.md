# DFCine canvas plan — configured, not run

Active canvas: `bfd0a59a-dbc5-43cd-bfec-1b6c352e7672` (`安全带UGC视频` / `画布 1`).

Provider workflow for both video nodes: `h3.ref.cloud` (MiniMax H3 Ref2VA). H3 supplies the visual plates without dialogue; ElevenLabs supplies separate Mandarin voiceover clips for post-production. Canvas is configured only. No node has been run and no AutoDL compute was started.

## Reference nodes

| Node | ID | Local asset | Status / role |
|---|---|---|---|
| S01 approved installed frame | `99c2643e-e991-4d75-84a4-493b5f3861bb` | `production/assets/products/shuiba-lulu-brown-black-pad-v1/approved/installed-driver-v1.png` | Approved installed scene, driver, belt geometry |
| SKU identity source - product-front | `8bb1ccfd-41cd-4987-9232-b93ebb4664a3` | `production/assets/products/shuiba-lulu-brown-black-pad-v1/source/product-front.png` | Product identity source of truth |
| DRAFT S02 detail frame | `da80333a-7946-4927-bd01-529726cf4939` | `production/jobs/lulu-commute-10s-20260925/assets/generated/s02-product-detail-draft-v1.png` | Provisional composition only; human review required before any run |

## Shot nodes and exact reference labels

| Shot node | ID | `<Picture 1>` | `<Picture 2>` | `<Picture 3>` | Parameters |
|---|---|---|---|---|---|
| S01 主驾开场 5s H3 Ref2VA | `fb4023ec-2cda-434f-84d1-2434958f24ee` | Approved installed frame; target opening composition | SKU identity | — | 9:16, 0.6 MP, 5 s, seed 58 |
| S02 飞行员噜噜产品细节 5s H3 Ref2VA | `eb25546a-394d-4919-9926-74d1293e7d80` | DRAFT detail composition; pending human review | SKU identity | Approved installed frame / geometry | 9:16, 0.6 MP, 5 s, seed 59 |

Both video nodes are idle. S01 and S02 prompt text is stored directly on the matching DFCine nodes. S02's prompt explicitly treats its draft composition as provisional, uses the standalone SKU for product truth, and the approved installed image for belt routing and scale. The shot plan's `audio_mode` is `post_tts` for both shots.

## Before any generation

1. Human-review `s02-product-detail-draft-v1.png`; if rejected, replace it with an approved frame and update S02 `<Picture 1>`.
2. Confirm the intended H3 runner/compute is available and review any displayed cost/limits.
3. Only after the user explicitly authorizes the preview run, run each five-second shot separately and review product geometry, belt continuity, speech, and sync.
4. Do not start AutoDL or call `dfcine_run_node` as part of this preparation.
