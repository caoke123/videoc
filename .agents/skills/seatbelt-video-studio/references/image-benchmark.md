# Image-model benchmark

## Split the benchmark

### T2I exploration

Compare GPT-Image2 official, Krea2 Turbo, Krea2 HQ, Klein T2I, and ZImage Realism for character, vehicle interior, selfie framing, and commercial lighting.

### Reference editing

Compare GPT-Image2 official, Qwen two/three-image edit, and Klein two-image edit for character identity, real product geometry, installed state, perspective, and lighting integration.

## Measurement

Record for every run:

- cold-start seconds
- warm-run seconds
- resolution and seed
- total attempts
- human-accepted outputs
- identity score (1-5)
- product geometry score (1-5)
- perspective score (1-5)
- realism score (1-5)
- notes

Rank by `total elapsed time / accepted outputs`. Keep prompt intent and aspect ratio fixed; use the nearest supported resolution. Generate one result per run unless batch behavior itself is being tested.

## Promotion

Use local fast models for composition exploration. Promote only human-approved candidates. Use GPT-Image2 or the benchmark winner for difficult final composites.

