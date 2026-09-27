# Legacy: ElevenLabs voiceover integration

This integration is retained only to reproduce earlier jobs. New jobs use the external Seed Audio 1.0 handoff contract in `production/integrations/seed-audio-1.0/brief-contract.md`. Do not generate new project voiceovers through this integration unless the user explicitly changes the policy.

This page documents the former ElevenLabs workflow only. It describes legacy jobs where H3 plates could be silent and voice was added later; that policy is superseded for new work. New H3 shots require native spoken audio for performance/lip-sync guidance, and new final narration uses the user's external Seed Audio 1.0 workflow.

## Local credentials

1. Copy `production/config/elevenlabs.env.example` to `production/config/elevenlabs.env`.
2. Set `ELEVENLABS_API_KEY` in that ignored local file. The API key is not stored in this repository. `ELEVENLABS_VOICE_ID` is an optional override; by default the selected voice is read from `production/config/elevenlabs.profile.json`.
3. The selected voice is 苏安娜（台湾女声）, ID `9lHjugDhwqoxA5MhX0az`. All voice IDs and notes are recorded in `production/config/voices.json`. An older job used `r6qgCCGI7RWKXCagm158`; it is not selected for this sample.

## Generate the current sample

From the repository root, preview the request first:

```powershell
python production/integrations/elevenlabs/generate_voiceover.py --job-id lulu-commute-10s-20260925
```

The preview is read-only. To make the paid API request, explicitly add `--run`:

```powershell
python production/integrations/elevenlabs/generate_voiceover.py --job-id lulu-commute-10s-20260925 --run
```

It reads the exact dialogue lines from `shot-plan.json` and writes one MP3 per shot under `audio/generated/elevenlabs/`. The profile defaults are in `production/config/elevenlabs.profile.json`; the voice and API key are supplied locally through the ignored env file or process environment. This integration never uploads voice audio to DFCine and never starts AutoDL.

The generation command is a paid external action. Do not use `--run` until the user explicitly asks to generate the audio.
