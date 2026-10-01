# Video-prompt writing techniques (from Seedance 2.0 UGC prompt patterns)

Reference for whoever writes `shot-plan.json` / `video-generation-contracts.json` — not a user-facing preset library. These are recurring patterns observed across public Seedance 2.0 prompt collections (github.com/YouMind-OpenLab/awesome-seedance-2-prompts, github.com/LearnPrompt/awesome-seedance, github.com/songguoxs/seedance-prompt-skill), worth reusing when they fit the shot's actual product/category constraints. Do not copy any prompt verbatim; extract the technique and rewrite for the current product, identity, and hard constraints. This project generates through AutoDL H3 via the local runner, not the 即梦/Seedance platform directly — only import the underlying prompt-writing techniques below, never source-platform-specific syntax or constraints.

## Timed scene breakdown inside one prompt

For a single continuous shot that has to carry more than one beat, split it into explicit second ranges (`0–4s`, `4–9s`, `9–15s`) instead of one flat paragraph. Each range gets its own framing, action, and micro-detail. This reads more reliably to the model than describing the same span as one long run-on sentence, and it's how our own `duration_seconds`/multi-beat shots should be worded internally even though the JSON field itself is a single `primary_action` string.

## UGC authenticity vocabulary

When a shot is meant to look like a real person's own phone footage (not a produced ad), name that explicitly and stack a few concrete descriptors rather than one adjective: "authentic UGC vlog", "handheld phone camera", "natural camera shake", "candid shots", "social-media-ready vertical 9:16". Avoid generic "realistic" alone — the specific phone/handheld/candid vocabulary is what actually shifts output away from a polished commercial look. This is the right register for our own H3 UGC shots; keep it consistent with `realistic-characters.md`'s "subtle irregularities, not a defect checklist" rule — these are framing/camera words, not skin-texture words.

## Lip-sync and breath-sync phrasing

For shots with dialogue, state the sync requirement directly next to the line: natural short pauses (~200–400ms) between phrases, mouth movement scaled to whisper/soft delivery vs. normal speech, breathing or chest movement synced to the emotional beat. Pair this with an explicit negative ("no exaggerated or robotic mouth movement") rather than assuming the model infers subtlety. Matches our existing H3 rule that every shot needs audible script-locked dialogue or narration to drive mouth movement.

## Layered, sourced sound description

Describe ambience as discrete named layers (distant traffic, fabric rustle, a specific prop sound, one music instrument faded in at the end) rather than a single mood word like "ambient sound". Each layer should be traceable to something visible or implied in the scene — don't invent a sound source that contradicts the visual. Useful for our `audio_direction` field, especially for `silent_plate` shots that still need a believable ambience description for post.

## Explicit rendered-text and identity negatives at the end

Recurring closer across working prompts: no on-screen text/subtitles/watermark, and an explicit consistency clause ("character maintains the same face/hair/clothing throughout, no deformation or drift"). Fold this into our `hard_avoid` / `global_locks` blocks — it's the same function our seatbelt/product identity locks already serve, just confirming the pattern is standard practice worth keeping, not something specific to this project.

## Reference-image identity lock: token + inherit-list + non-inherit-list

The single highest-value pattern for our multi-reference shots. For each reference image, do three things explicitly instead of one vague "keep consistent":
1. Give it a stable name and reuse it verbatim everywhere in the shot (we already do this via `reference_roles` keys like `product_identity`, `male_identity`).
2. **Enumerate what to inherit from it**, item by item — not "keep the same person" but the actual list: face shape, features, skin tone, apparent age, hairstyle, hair color, height, build, body proportions, each garment, footwear, overall demeanor. A vague "same as reference" is where drift creeps in across shots.
3. **Enumerate what NOT to inherit** — this is the step our existing prompts usually skip, and it's the one that actually prevents contamination: the reference image's own background, room, furniture, pose, framing, composition, original lighting, and any text in it must not carry over into the generated shot. Without this explicit non-inherit clause, a character reference photo's background/pose bleeds into the new scene.

Also call out the moments identity is most likely to drift — head turns, occlusion (hand near face, hair across face), fast motion, speaking — and restate "same face" specifically at those points rather than only once at the top of the prompt.

## UGC product-review pattern: separate the person-lock from the product-lock

For "creator holds/uses/wears the product on camera" shots (our closest match: seatbelt pad installed-and-shown, bag-charm handheld shots):
- Write the person-lock and the product-lock as two separate blocks, and break the product down into its physical parts (shape, material, hinge/seam, color, proportions) rather than naming it once — this is exactly our existing black-pad-material/1.4x-width-ratio approach, confirming it's the right level of detail, not overkill.
- Weld dialogue to the beat it happens on ("这句话就说在他走进厨房那一秒"), not as a separate caption block disconnected from the action — matches our existing H3 rule that dialogue must drive the actual mouth movement in that frame, not float free.
- The reviewed collections converge on a fixed two-beat closing pattern for this shot type: product alone in frame, then the person holding the product looking at camera. Worth defaulting to for our own installed/handheld closing shots unless the shot plan has a specific reason not to.
- Always add an explicit "realistic hands" instruction whenever a hand touches/holds the product — hand shots are where generation most often breaks (wrong finger count), and it's cheap insurance to state it every time rather than only when a problem shows up in review.

## What not to import

These prompts are single-shot, self-contained cinematic scripts for a general creator audience — they don't carry product-identity locks, reference-image roles, or category hard-constraints the way our shots must. Never paste one in as-is; a shot here still needs `reference_roles`, `product`/`vehicle`/`identity` locks from the job's `global_locks`, and category-profile compliance before it's usable.
