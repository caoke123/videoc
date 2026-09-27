"""Validate an edit plan and build a self-contained HyperFrames composition.

No generation API or paid compute is called. The builder never alters source media.
"""

from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
import sys
from pathlib import Path


EPS = 0.04


def fail(message: str) -> None:
    raise ValueError(message)


def seconds(value: object, label: str, *, zero_ok: bool = True) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        fail(f"{label} must be a number")
    value = float(value)
    if value < 0 or (not zero_ok and value == 0) or value > 3600:
        fail(f"{label} is out of range")
    return value


def source_path(job: Path, relative: str) -> Path:
    if not isinstance(relative, str):
        fail("media path must be a string")
    item = Path(relative)
    if item.is_absolute() or ".." in item.parts or not item.parts:
        fail(f"media path must stay inside the job: {relative}")
    resolved = (job / item).resolve()
    if not resolved.is_relative_to(job.resolve()):
        fail(f"media path escapes the job: {relative}")
    return resolved


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True,
        capture_output=True,
        check=True,
    )
    return float(result.stdout.strip())


def stage(source: Path, target_dir: Path, name: str) -> str:
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{name}{source.suffix.lower()}"
    if not target.exists() or target.stat().st_size != source.stat().st_size or target.stat().st_mtime_ns != source.stat().st_mtime_ns:
        shutil.copy2(source, target)
    return f"media/{target.name}"


def a(value: object) -> str:
    return html.escape(str(value), quote=True)


def t(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".") if value else "0"


def build(plan_path: Path, allow_missing_audio: bool, carve: bool) -> list[str]:
    plan_path = plan_path.resolve()
    job = plan_path.parent.parent if plan_path.parent.name == "edit" else None
    if job is None or not (job / "shot-plan.json").is_file():
        fail("edit plan must be at <job>/edit/edit-plan.json")
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if plan.get("schema_version") != 1:
        fail("unsupported edit-plan schema_version")
    canvas = plan["canvas"]
    width, height, fps = (int(canvas[k]) for k in ("width", "height", "fps"))
    if min(width, height, fps) <= 0 or width > 4320 or height > 7680 or fps > 120:
        fail("invalid canvas")
    total = seconds(plan["duration_seconds"], "duration_seconds", zero_ok=False)
    style = plan.get("style", {})
    if not isinstance(style, dict):
        fail("style must be an object")
    cta_top_percent = float(style.get("cta_top_percent", 85))
    if not 0 <= cta_top_percent <= 90:
        fail("style.cta_top_percent must be 0..90")
    caption_box = style.get("caption_box", False)
    if not isinstance(caption_box, bool):
        fail("style.caption_box must be boolean")
    caption_box_css = "background: rgba(13,13,13,.68); padding: 10px 12px; border-radius: 12px; font-size: 44px;" if caption_box else ""
    shots = sorted(plan.get("shots", []), key=lambda x: x["start"])
    if not shots:
        fail("at least one shot is required")
    warnings: list[str] = []
    cursor = 0.0
    output = job / "edit" / "hyperframes"
    if not (output / "hyperframes.json").is_file():
        fail("HyperFrames project is not scaffolded; run hyperframes init first")
    media = output / "media"
    videos: list[str] = []
    for index, shot in enumerate(shots):
        shot_id = str(shot["id"])
        start = seconds(shot["start"], f"{shot_id}.start")
        duration = seconds(shot["duration"], f"{shot_id}.duration", zero_ok=False)
        source_in = seconds(shot.get("source_in", 0), f"{shot_id}.source_in")
        if abs(start - cursor) > EPS:
            fail(f"uncovered or overlapping picture near {t(cursor)}s / {t(start)}s; resolve in edit plan")
        source = source_path(job, shot["path"])
        if not source.is_file():
            fail(f"missing shot: {shot['path']}")
        if source_in + duration > probe_duration(source) + EPS:
            fail(f"{shot_id} trim exceeds source duration")
        src = stage(source, media, f"shot-{index:02d}-{shot_id}")
        videos.append(
            f'<video id="shot-{a(shot_id)}" class="clip picture" src="{a(src)}" '
            f'data-start="{t(start)}" data-duration="{t(duration)}" data-media-start="{t(source_in)}" '
            f'data-track-index="{index}" muted playsinline></video>'
        )
        cursor = start + duration
    if abs(cursor - total) > EPS:
        fail(f"picture ends at {t(cursor)}s, composition ends at {t(total)}s")

    voices: list[str] = []
    for index, voice in enumerate(plan.get("voiceovers", [])):
        ident = str(voice["id"])
        start = seconds(voice["start"], f"{ident}.start")
        source = source_path(job, voice["path"])
        if not source.is_file():
            if not allow_missing_audio:
                fail(f"missing voiceover: {voice['path']}")
            warnings.append(f"MISSING_VOICEOVER {ident}: {voice['path']}")
            continue
        actual = probe_duration(source)
        duration = seconds(voice.get("duration", min(actual, total - start)), f"{ident}.duration", zero_ok=False)
        if start + duration > total + EPS:
            fail(f"{ident} exceeds composition duration")
        if duration > actual + EPS:
            fail(f"{ident} trim exceeds source duration")
        src = stage(source, media, f"voice-{index:02d}-{ident}")
        voices.append(
            f'<audio id="voice-{a(ident)}" class="clip" src="{a(src)}" data-audio-group="voiceover" '
            f'data-start="{t(start)}" data-duration="{t(duration)}" data-track-index="{20 + index}" data-volume="1"></audio>'
        )

    music = plan.get("music")
    music_html = ""
    if music:
        source = source_path(job, music["path"])
        if not source.is_file():
            fail(f"missing music: {music['path']}")
        start = seconds(music["start"], "music.start")
        duration = seconds(music["duration"], "music.duration", zero_ok=False)
        if duration > probe_duration(source) + EPS or start + duration > total + EPS:
            fail("music duration exceeds source or composition")
        volume = float(music.get("volume", 0.3))
        if not 0 <= volume <= 1:
            fail("music volume must be 0..1")
        src = stage(source, media, "music-bed")
        music_html = (
            f'<audio id="music-bed" class="clip" src="{a(src)}" data-start="{t(start)}" '
            f'data-duration="{t(duration)}" data-track-index="10" data-volume="{t(volume)}"></audio>'
        )
        if voices and not carve:
            warnings.append("MIX_GATE: run the HyperFrames voiceover-carve step, then check and listen before render")

    overlays: list[str] = []
    for caption in plan.get("captions", []):
        start = seconds(caption["start"], "caption.start")
        duration = seconds(caption["duration"], "caption.duration", zero_ok=False)
        if start + duration > total + EPS:
            fail("caption exceeds composition")
        top_percent = float(caption.get("top_percent", 77))
        if not 0 <= top_percent <= 90:
            fail("caption.top_percent must be 0..90")
        overlays.append(
            f'<div id="{a(caption["id"])}" class="clip caption" data-start="{t(start)}" '
            f'data-duration="{t(duration)}" data-track-index="30" style="top: {t(top_percent)}%">{a(caption["text"])}</div>'
        )
    cta = plan.get("cta")
    if cta:
        start = seconds(cta["start"], "cta.start")
        duration = seconds(cta["duration"], "cta.duration", zero_ok=False)
        if start + duration > total + EPS:
            fail("CTA exceeds composition")
        overlays.append(
            f'<div id="cta" class="clip cta" data-start="{t(start)}" data-duration="{t(duration)}" '
            f'data-track-index="31" data-var-text="cta">{a(cta["text"])}</div>'
        )
    variables = ([
        {"id": "name", "type": "string", "label": "导出名称", "default": "default"},
        {"id": "cta", "type": "string", "label": "结尾文案", "default": cta["text"]},
    ] if cta else [])
    var_attr = a(json.dumps(variables, ensure_ascii=False, separators=(",", ":")))
    markup = "\n      ".join(videos + overlays + voices + ([music_html] if music_html else []))
    composition = f'''<!doctype html>
<html lang="zh-CN" data-resolution="portrait" data-composition-variables="{var_attr}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width={width}, height={height}" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    @font-face {{ font-family: "Microsoft YaHei"; src: local("Microsoft YaHei"); }}
    * {{ box-sizing: border-box; }}
    html, body {{ margin: 0; width: {width}px; height: {height}px; overflow: hidden; background: #090909; }}
    #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Microsoft YaHei", sans-serif; }}
    .picture {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}
    .caption {{ position: absolute; left: 6%; right: 6%; top: 77%; width: 88%; text-align: center; color: white; font-size: 50px; font-weight: 650; line-height: 1.35; white-space: pre-line; text-shadow: 0 2px 8px #000, 0 0 14px #000; {caption_box_css} }}
    .cta {{ position: absolute; left: 6%; right: 6%; top: {t(cta_top_percent)}%; width: 88%; padding: 18px 20px; border-radius: 18px; background: rgba(13,13,13,.68); color: #fff; font-size: 45px; font-weight: 700; text-align: center; line-height: 1.35; }}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="{t(total)}" data-width="{width}" data-height="{height}">
      {markup}
  </div>
  <script>const tl = gsap.timeline({{ paused: true }}); window.__timelines["main"] = tl;</script>
</body>
</html>
'''
    (output / "index.html").write_text(composition, encoding="utf-8")
    if carve and music and voices:
        script = Path(__file__).resolve().parents[2] / ".agents" / "skills" / "hyperframes-audio" / "scripts" / "carve.mjs"
        if not script.is_file():
            fail(f"HyperFrames audio carve skill not installed: {script}")
        subprocess.run(["node", str(script), "--comp", "index.html", "--bed", "music-bed"], cwd=output, check=True)
        warnings.append("MIX_REVIEW: listen to voice intelligibility and music level before delivery")
    rows = [{"name": v["name"], "cta": v["cta"]} for v in plan.get("variants", [])]
    if rows:
        names = [row["name"] for row in rows]
        if len(names) != len(set(names)) or any(not name or not all(c.isalnum() or c in "-_" for c in name) for name in names):
            fail("variant names must be unique and filesystem-safe")
        (output / "batch.json").write_text(json.dumps({"rows": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "build-report.json").write_text(json.dumps({"warnings": warnings, "duration": total, "fps": fps}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("--allow-missing-audio", action="store_true", help="Preview-only; final delivery still requires all planned audio")
    parser.add_argument("--carve", action="store_true", help="Apply voiceover-aware music carve after building; requires @hyperframes/core in the project")
    args = parser.parse_args()
    try:
        warnings = build(args.plan, args.allow_missing_audio, args.carve)
    except (ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(f"EDIT PLAN ERROR: {exc}", file=sys.stderr)
        return 2
    print("HyperFrames composition built from edit plan.")
    for warning in warnings:
        print(f"WARNING: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
