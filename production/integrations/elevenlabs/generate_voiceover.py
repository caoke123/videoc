"""Generate per-shot Mandarin voiceover clips from a production job's shot plan.

No API request is made unless --run is supplied. Uses Python's standard library.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[3]
CONFIG_DIR = ROOT / "production" / "config"


def load_local_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job-id", required=True, help="Folder name under production/jobs")
    parser.add_argument("--shots", nargs="+", help="Shot IDs, e.g. S01 S02; defaults to all shots")
    parser.add_argument("--run", action="store_true", help="Submit paid TTS API requests")
    args = parser.parse_args()

    load_local_env(CONFIG_DIR / "elevenlabs.env")
    profile_path = CONFIG_DIR / "elevenlabs.profile.json"
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "").strip() or profile.get("voice_id", "").strip()
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()

    job_dir = ROOT / "production" / "jobs" / args.job_id
    plan_path = job_dir / "shot-plan.json"
    if not plan_path.is_file():
        parser.error(f"Job shot plan not found: {plan_path}")
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    requested = set(args.shots or [])
    shots = [shot for shot in plan.get("shots", []) if not requested or shot["shot_id"] in requested]
    if requested and requested != {shot["shot_id"] for shot in shots}:
        parser.error(f"Unknown shot ID(s): {', '.join(sorted(requested - {s['shot_id'] for s in shots}))}")
    if not shots:
        parser.error("No shots found in shot plan")

    if args.run and not voice_id:
        print("Configuration incomplete: set ELEVENLABS_VOICE_ID in production/config/elevenlabs.env.")
        return 2
    if args.run and not api_key:
        print("Configuration incomplete: set ELEVENLABS_API_KEY in production/config/elevenlabs.env.")
        return 2
    if args.run and not api_key.startswith("sk_"):
        print("ELEVENLABS_API_KEY does not look like an API key (expected prefix sk_); no request was sent.")
        return 2

    for shot in shots:
        if shot.get("audio_mode") != "post_tts":
            parser.error(f"{shot['shot_id']} must use audio_mode=post_tts before TTS generation")
        text = shot.get("dialogue", "").strip()
        if not text:
            parser.error(f"{shot['shot_id']} has no dialogue text")
        output = job_dir / "audio" / "generated" / "elevenlabs" / f"{shot['shot_id']}-voiceover.mp3"
        print(f"{'RUN' if args.run else 'DRY RUN'} {shot['shot_id']}: {text}")
        voice_label = profile.get("voice_name", "")
        voice_description = profile.get("voice_description", "")
        print(f"  voice={voice_label} ({voice_description}) voice_id={voice_id or '(not selected)'} model={profile['model_id']} language={profile['language_code']}")
        print(f"  output={output.relative_to(ROOT)}")
        if not args.run:
            continue

        payload = {
            "text": text,
            "model_id": profile["model_id"],
            "language_code": profile["language_code"],
            "voice_settings": profile["voice_settings"],
            "apply_text_normalization": profile["text_normalization"],
        }
        url = (
            "https://api.elevenlabs.io/v1/text-to-speech/"
            f"{quote(voice_id, safe='')}?output_format={quote(profile['output_format'], safe='')}"
        )
        request = Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=90) as response:
                audio_bytes = response.read()
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:1000].replace(api_key, "[REDACTED]")
            print(f"ElevenLabs returned HTTP {exc.code}: {detail}", file=sys.stderr)
            return 1
        except URLError as exc:
            print(f"Could not reach ElevenLabs: {exc.reason}", file=sys.stderr)
            return 1
        if not audio_bytes:
            print(f"ElevenLabs returned an empty audio file for {shot['shot_id']}", file=sys.stderr)
            return 1
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(audio_bytes)
        print(f"  saved {len(audio_bytes)} bytes")

    if not args.run:
        print("No API request was made. Add --run only after voice choice and explicit generation approval.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
