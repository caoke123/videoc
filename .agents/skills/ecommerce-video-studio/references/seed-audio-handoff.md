# Seed Audio 1.0 voice handoff

The user creates final narration outside Codex with Seed Audio 1.0. The studio prepares an exact, production-ready brief; it does not generate, upload, or submit audio to a paid provider.

## Required handoff for each line

Record a separate line/shot entry with:

- Exact spoken text, including punctuation and product-name pronunciation notes. Do not add filler words or rewrite approved copy.
- Speaker role/persona (for example: 20–24-year-old urban Chinese woman driver speaking as a genuine product owner), plus the requested voice identity if supplied. Do not invent a voice ID or imitate an unapproved real person.
- Language, accent, and pronunciation notes. State Mandarin/Taiwan-accented Mandarin only when the creative explicitly calls for it.
- Emotion and intensity (e.g. pleasantly surprised, warm and sincere, restrained enthusiasm; intensity 2/5).
- Vocal tone and delivery (conversational UGC, close-mic, smile in voice, conversational rather than announcer-like; pace, pauses, emphasis, breathiness if desired).
- Target duration for the line and its shot window; include phrase/word timing when lip-sync matters.
- Output request: clean dry voice only, no music, SFX, ambience, extra words, or intro/outro unless explicitly requested.

## Timing and continuity

Use the same exact words in the H3 native dialogue and external Seed Audio handoff. For visible speech, keep the H3 mouth movement simple and the line short enough for the shot; place longer copy as off-screen narration. Phrase timing is an intended performance guide, not a guarantee. After the user returns audio, inspect its actual duration and waveform, compare visible mouth movement, then time captions from the returned audio. If lip sync cannot be made credible, prefer an off-screen line or cutaway and disclose the tradeoff; do not claim exact sync.

Save the user-facing brief at `production/jobs/<job-id>/audio/brief/seed-audio-1.0.md`. Preserve returned original audio under `audio/source/`; use derived copies only for editing. Keep each original H3 audio-bearing clip as provenance, muting it in the final edit only after the replacement voice has been checked.

## Brief template

```text
Job / shot:
Exact text:
Speaker role/persona:
Voice identity (if supplied):
Language/accent/pronunciation:
Emotion / intensity:
Tone and delivery:
Pace / pauses / emphasis:
Target line duration:
Shot window / intended phrase timing:
Audio output: clean voice only; no added music/SFX/ambience/words.
```
