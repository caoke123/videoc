#!/usr/bin/env python3
import argparse
import json
import shutil
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an ecommerce-video production job.")
    parser.add_argument("--id", required=True, dest="job_id")
    parser.add_argument("--category", required=True, dest="category_id")
    parser.add_argument("--mode", choices=["original", "reference", "hybrid"], default="original")
    parser.add_argument("--root", default="production/jobs")
    args = parser.parse_args()

    if not args.job_id.replace("-", "").replace("_", "").isalnum():
        raise SystemExit("job id may contain only letters, digits, hyphens, and underscores")

    skill_dir = Path(__file__).resolve().parents[1]
    project_root = skill_dir.parents[2]
    catalog_path = project_root / "production" / "config" / "categories.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    categories = {item["category_id"]: item for item in catalog["categories"]}
    if args.category_id not in categories:
        raise SystemExit(f"unknown category: {args.category_id}")
    job_dir = Path(args.root).resolve() / args.job_id
    if job_dir.exists():
        raise SystemExit(f"job already exists: {job_dir}")

    for sub in [
        "assets/source", "assets/approved", "assets/generated", "prompts",
        "dfcine", "renders/preview", "renders/accepted", "post", "delivery"
    ]:
        (job_dir / sub).mkdir(parents=True, exist_ok=True)

    copies = {
        "brief.template.json": "brief.json",
        "shot-plan.template.json": "shot-plan.json",
        "review.template.json": "review.json",
        "benchmark.template.json": "image-benchmark.json"
    }
    for source, target in copies.items():
        shutil.copyfile(skill_dir / "assets" / source, job_dir / target)

    brief_path = job_dir / "brief.json"
    brief = json.loads(brief_path.read_text(encoding="utf-8"))
    brief["job_id"] = args.job_id
    brief["category_id"] = args.category_id
    brief["mode"] = args.mode
    brief_path.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (job_dir / "run-log.jsonl").touch()
    print(job_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
