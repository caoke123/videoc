# Claude Video and MiniMax H3 integration

`seatbelt-video-studio` remains the governing production skill. The external projects are subordinate adapters.

## Reference-video analysis

Use `claude-video` only to inspect reference videos. It downloads or reads a source, extracts selected frames, obtains captions or a transcript, and returns evidence for a `reference` or `hybrid` brief. It does not generate media and must not replace human review.

Keep the original file in the job's `assets/source/`. Capture hook timing, spoken words, shot boundaries, camera movement, visible actions, audio rhythm, and transition cues. Translate these into a neutral structure summary in the brief and shot plan. Never copy a reference person's identity, logo, product, wording, or unsupported claim.

The local runtime requires `ffmpeg` and `yt-dlp`. Native captions are preferred; Whisper is a fallback only when captions are unavailable. If dependencies are missing, mark analysis as pending rather than pretending the video was inspected.

## H3 generation

Use MiniMax-H3 `Ref2VA` through DFCine's `h3.ref.cloud`. H3 prompt-writing compiles the shot contract; DFCine remains the execution and result-tracking layer.

Assign references by role after inspecting the actual DFCine input labels:

- product identity: standalone approved product image;
- installed geometry and target scene: approved installed-state image;
- optional motion/audio reference: only when supplied and approved;
- prompt: one primary action, one motivated camera move, explicit endpoint.

Prefer `audio_mode: native` for short dialogue-led shots. Put the exact spoken line in `dialogue`; put voice delivery, ambience, sound effects, and timing in `audio_direction`. Keep important advertising text and CTA as post-production overlays even when H3 speaks the line.

Every product prompt must state that the product is already installed at the first frame; the belt stays continuous, flat, and aligned; the pad and plush remain one rigid assembly; no installation or adjustment action occurs; no safety claim, price, logo, or watermark is generated; and the final frame leaves space for post subtitles and CTA.

## Review boundary

Prepare prompts and dry-run DFCine mutations before any paid or GPU run. Generate one preview per shot, then human-review audio, lip sync, product geometry, belt continuity, and endpoint stability. Do not auto-retry. Record accepted results before post-production.
