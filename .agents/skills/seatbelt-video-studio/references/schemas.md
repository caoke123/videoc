# Project data

## Required job files

- `brief.json`: category ID, SKU, audience, occasion, creative concept, character, scene, actions, spoken script, claims, format, and optional references. Schema v2 is used for new jobs; older jobs without a category ID remain legacy seatbelt jobs.
- `shot-plan.json`: ordered shots and generation contracts.
- `review.json`: human decisions and optional AI findings.
- `run-log.jsonl`: append-only DFCine run records.

## Shot contract

Each shot requires:

```json
{
  "shot_id": "S01",
  "start_seconds": 0,
  "end_seconds": 3,
  "purpose": "hook",
  "generation_mode": "character_i2v",
  "audio_mode": "native",
  "dialogue": "",
  "audio_direction": "",
  "references": [],
  "primary_action": "",
  "camera": "",
  "end_state": "",
  "dfcine_workflow_id": "",
  "status": "planned"
}
```

Legacy audio modes remain readable for existing jobs. New MiniMax H3 jobs must use `native` and provide the exact dialogue or off-screen narration; `post_tts` and `silent_plate` are not valid choices for a new H3 shot.

For H3 native audio, `dialogue` is the exact intended spoken line and `audio_direction` describes voice role, emotion, delivery, ambience, sound effects, and timing. Preserve product names and approved copy verbatim. H3 audio guides audible performance and mouth movement even if the user later replaces it with external Seed Audio; advertising text remains a post overlay.

Allowed review decisions: `pending`, `accepted`, `needs_ai_review`, `regenerate`, `post_fix`.

## Run log record

```json
{"time":"ISO-8601","shot_id":"S01","node_id":"uuid","run_id":"id","workflow_id":"id","seed":58,"status":"success","results":[]}
```
