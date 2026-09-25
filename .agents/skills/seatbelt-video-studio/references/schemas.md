# Project data

## Required job files

- `brief.json`: audience, copy, claims, format, references.
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

Allowed audio modes: `native`, `post_tts`, `silent_plate`.

For H3 native audio, `dialogue` is the intended spoken line and `audio_direction` describes voice, ambience, sound effects, and timing. Important advertising text remains a post-production overlay.

Allowed review decisions: `pending`, `accepted`, `needs_ai_review`, `regenerate`, `post_fix`.

## Run log record

```json
{"time":"ISO-8601","shot_id":"S01","node_id":"uuid","run_id":"id","workflow_id":"id","seed":58,"status":"success","results":[]}
```
