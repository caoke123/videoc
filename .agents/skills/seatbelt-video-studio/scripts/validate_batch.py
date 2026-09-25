#!/usr/bin/env python3
import json
import sys
from pathlib import Path


ALLOWED_MODES = {"original", "reference", "hybrid"}
ALLOWED_AUDIO = {"native", "post_tts", "silent_plate"}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_batch.py <job-dir>")
    root = Path(sys.argv[1]).resolve()
    errors = []
    for name in ["brief.json", "shot-plan.json", "review.json", "run-log.jsonl"]:
        if not (root / name).exists():
            errors.append(f"missing {name}")
    if errors:
        print("\n".join(f"ERROR: {e}" for e in errors))
        return 1

    try:
        brief = load(root / "brief.json")
        plan = load(root / "shot-plan.json")
        review = load(root / "review.json")
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: invalid JSON: {exc}")
        return 1

    if brief.get("mode") not in ALLOWED_MODES:
        errors.append("brief.mode must be original, reference, or hybrid")
    if review.get("automatic_ai_review") is not False:
        errors.append("review.automatic_ai_review must default to false")
    if review.get("automatic_retry") is not False:
        errors.append("review.automatic_retry must default to false")

    shots = plan.get("shots")
    if not isinstance(shots, list):
        errors.append("shot-plan.shots must be an array")
        shots = []
    prior_end = -1.0
    seen = set()
    required = {"shot_id", "start_seconds", "end_seconds", "purpose", "generation_mode", "audio_mode", "primary_action", "camera", "end_state", "status"}
    for i, shot in enumerate(shots):
        label = f"shots[{i}]"
        if not isinstance(shot, dict):
            errors.append(f"{label} must be an object")
            continue
        missing = required - set(shot)
        if missing:
            errors.append(f"{label} missing: {', '.join(sorted(missing))}")
        sid = shot.get("shot_id")
        if sid in seen:
            errors.append(f"duplicate shot_id: {sid}")
        seen.add(sid)
        start, end = shot.get("start_seconds"), shot.get("end_seconds")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or end <= start:
            errors.append(f"{label} has invalid time range")
        elif start < prior_end:
            errors.append(f"{label} overlaps or is out of order")
        else:
            prior_end = end
        if shot.get("audio_mode") not in ALLOWED_AUDIO:
            errors.append(f"{label}.audio_mode is invalid")

    if errors:
        print("\n".join(f"ERROR: {e}" for e in errors))
        return 1
    print(f"BATCH_OK job={brief.get('job_id')} shots={len(shots)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

