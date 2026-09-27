# Seed Audio 1.0 external voice handoff contract

## Policy

Seed Audio 1.0 is the selected narration workflow. The user generates audio externally and returns it to the job. Codex prepares the copy and direction, but must not invoke ElevenLabs, Seed Audio, or another TTS provider under this policy. Do not assume an API, account, voice ID, or price.

## Required per-job artifact

Write `production/jobs/<job-id>/audio/brief/seed-audio-1.0.md` before video generation. Include one entry per spoken shot with exact text, speaker role/persona, supplied voice identity (if any), language/accent/pronunciation, emotion/intensity, tone/delivery, pace/pauses/emphasis, target line duration, shot window, and intended phrase timing. Request clean voice-only output, with no added music, SFX, ambience, or words unless the brief says otherwise.

For every MiniMax H3 shot, native speech or off-screen narration is mandatory to guide performance/mouth movement, including product-detail shots. The H3 dialogue must match the external brief verbatim. The H3 audio is a generation guide and provenance; the returned Seed Audio is the final narration source unless the user instructs otherwise.

## Import checks

When the user returns audio:

1. Preserve the original in `audio/source/` and record its source/name.
2. Probe codec, sample rate, channel count, and actual duration; listen/check the exact spoken wording.
3. Compare shot window and visible mouth performance; do not promise frame-exact lip sync. If mismatch is visible, suggest a cutaway/off-screen treatment or request a re-record.
4. Generate subtitle timing from the actual returned audio, not target duration estimates.
5. In the Jianying Pro draft, keep voice, source H3 audio, music/SFX, captions, and overlays on separate editable tracks where supported. Mute source H3 audio only after replacement audio is validated.

Do not delete or overwrite existing ElevenLabs files or credentials. Prior ElevenLabs jobs remain reproducible legacy work.
