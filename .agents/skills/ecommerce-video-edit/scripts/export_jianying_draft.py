#!/usr/bin/env python3
"""Write an edit-plan.json as a new Jianying Pro draft (video clips + caption track).

Uses the draft writer of github.com/luoluoluo22/jianying-editor-skill (MIT, commit 32c5692...), cloned
and installed by the caller; this file is only the adapter. It never overwrites an existing draft and never
exports a video: the user fine-cuts and exports in Jianying.

  python export_jianying_draft.py --job production/jobs/<job-id> --name <new draft name> --exporter <clone>/scripts
"""
import argparse
import json
import os
import sys

US = 1_000_000


def default_root():
    return os.path.join(os.environ["LOCALAPPDATA"], "JianyingPro", "User Data", "Projects", "com.lveditor.draft")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    parser.add_argument("--name", required=True, help="new draft folder name; must not exist")
    parser.add_argument("--exporter", required=True, help="path to jianying-editor-skill/scripts")
    parser.add_argument("--drafts-root", default=None)
    parser.add_argument("--no-captions", action="store_true")
    args = parser.parse_args()

    job = os.path.abspath(args.job)
    plan = json.load(open(os.path.join(job, "edit", "edit-plan.json"), encoding="utf-8"))
    root = os.path.abspath(args.drafts_root or default_root())
    if os.path.exists(os.path.join(root, args.name)):
        sys.exit(f"refusing to overwrite existing draft: {args.name}")
    missing = [s["path"] for s in plan["shots"] if not os.path.isfile(os.path.join(job, s["path"]))]
    if missing:
        sys.exit(f"missing media: {missing}")

    sys.path.insert(0, os.path.abspath(args.exporter))
    from jy_wrapper import JyProject  # noqa: E402

    canvas = plan["canvas"]
    project = JyProject(args.name, width=canvas["width"], height=canvas["height"], drafts_root=root, overwrite=False)
    for shot in plan["shots"]:
        project.add_clip(
            os.path.join(job, shot["path"]),
            source_start=round(shot["source_in"] * US),
            duration=round(shot["duration"] * US),
            target_start=round(shot["start"] * US),
            track_name="VideoTrack",
        )
    if not args.no_captions:
        for caption in plan.get("captions", []):
            project.add_text_simple(caption["text"], start_time=round(caption["start"] * US), duration=round(caption["duration"] * US), track_name="Subtitles")
    result = project.save()
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
