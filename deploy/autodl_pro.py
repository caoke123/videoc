#!/usr/bin/env python3
"""Small AutoDL Pro lifecycle client for direct H3 tests."""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "production" / "config"
RUNTIME = CONFIG / "autodl-runtime.json"
WATCHDOG_LOG = CONFIG / "autodl-watchdog.log"
BASE = "https://api.autodl.com"


def token() -> str:
    env_file = CONFIG / "autodl.env"
    for raw in env_file.read_text(encoding="utf-8-sig").splitlines():
        if raw.startswith("AUTODL_TOKEN="):
            value = raw.split("=", 1)[1].strip().strip('"\'')
            if value:
                return value
    raise RuntimeError("AUTODL_TOKEN is missing from production/config/autodl.env")


def api(method: str, path: str, body: dict | None = None):
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        BASE + path,
        data=payload,
        method=method,
        headers={
            "Authorization": token(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.load(response)
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"AutoDL API request failed: {type(exc).__name__}") from None
    if result.get("code") != "Success":
        raise RuntimeError(f"AutoDL API error: {result.get('code')}: {result.get('msg')}")
    return result.get("data")


def current_id() -> str:
    return json.loads(RUNTIME.read_text(encoding="utf-8"))["instance_uuid"]


def status(instance_uuid: str) -> str:
    return api("GET", "/api/v1/dev/instance/pro/status", {"instance_uuid": instance_uuid})


def snapshot(instance_uuid: str) -> dict:
    return api("GET", "/api/v1/dev/instance/pro/snapshot", {"instance_uuid": instance_uuid})


def power_off(instance_uuid: str) -> None:
    state = status(instance_uuid)
    if state in {"shutdown", "stopped", "off"}:
        return
    api("POST", "/api/v1/dev/instance/pro/power_off", {"instance_uuid": instance_uuid})


def write_runtime(instance_uuid: str, minutes: int, gpu_spec: str) -> None:
    data = {
        "instance_uuid": instance_uuid,
        "gpu_spec_uuid": gpu_spec,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "deadline_unix": time.time() + minutes * 60,
        "max_runtime_minutes": minutes,
    }
    temporary = RUNTIME.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    temporary.replace(RUNTIME)


def start_watchdog() -> None:
    output = WATCHDOG_LOG.open("a", encoding="utf-8")
    options = {"stdout": output, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
    else:
        options["start_new_session"] = True
    try:
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "watchdog"], **options)
    finally:
        output.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    command = parser.add_subparsers(dest="command", required=True)
    command.add_parser("inspect")
    command.add_parser("status")
    command.add_parser("stop")
    command.add_parser("watchdog")
    create = command.add_parser("create")
    create.add_argument("--gpu-spec", default="4090D")
    create.add_argument("--image-id", default="base-image-l2t43iu6uk")
    create.add_argument("--expand-gb", type=int, default=220)
    create.add_argument("--max-runtime-minutes", type=int, default=90)
    args = parser.parse_args()

    if args.command == "inspect":
        result = api("POST", "/api/v1/dev/instance/pro/list", {"page_index": 1, "page_size": 100})
        print(json.dumps([
            {"id": item.get("uuid"), "status": item.get("status"), "gpu_spec": item.get("gpu_spec_uuid")}
            for item in result.get("list", [])
        ], ensure_ascii=False))
    elif args.command == "create":
        if RUNTIME.exists():
            raise RuntimeError("Runtime state already exists; inspect or stop the active test first")
        if args.max_runtime_minutes < 10 or args.max_runtime_minutes > 180:
            raise RuntimeError("max runtime must be between 10 and 180 minutes")
        guard = (
            "nohup sh -c 'sleep " + str(args.max_runtime_minutes * 60) +
            "; /usr/bin/shutdown -h now' >/tmp/videoc-h3-watchdog.log 2>&1 &"
        )
        instance_uuid = api("POST", "/api/v1/dev/instance/pro/create", {
            "req_gpu_amount": 1,
            "expand_system_disk_by_gb": args.expand_gb,
            "gpu_spec_uuid": args.gpu_spec,
            "image_uuid": args.image_id,
            "cuda_v_from": 113,
            "instance_name": "videoc-h3-direct-test",
            "start_command": guard,
        })
        write_runtime(instance_uuid, args.max_runtime_minutes, args.gpu_spec)
        start_watchdog()
        print(json.dumps({"instance_uuid": instance_uuid, "status": "created", "max_runtime_minutes": args.max_runtime_minutes}))
    elif args.command == "status":
        instance_uuid = current_id()
        result = {"instance_uuid": instance_uuid, "status": status(instance_uuid)}
        if result["status"] == "running":
            info = snapshot(instance_uuid)
            result.update({
                "gpu_name": info.get("snapshot_gpu_alias_name"),
                "memory_limit_bytes": (info.get("usage_info") or {}).get("mem_limit"),
                "system_disk_bytes": (info.get("usage_info") or {}).get("root_fs_total_size"),
                "payg_price_raw": info.get("payg_price"),
            })
        print(json.dumps(result, ensure_ascii=False))
    elif args.command == "stop":
        instance_uuid = current_id()
        power_off(instance_uuid)
        print(json.dumps({"instance_uuid": instance_uuid, "stop_requested": True, "status": status(instance_uuid)}))
    elif args.command == "watchdog":
        state = json.loads(RUNTIME.read_text(encoding="utf-8"))
        instance_uuid = state["instance_uuid"]
        deadline = state["deadline_unix"]
        while time.time() < deadline:
            time.sleep(min(30, max(1, deadline - time.time())))
            try:
                if status(instance_uuid) in {"shutdown", "stopped", "off"}:
                    return
            except Exception as exc:
                print(f"watchdog status check: {exc}", flush=True)
        for attempt in range(3):
            try:
                power_off(instance_uuid)
                print(f"watchdog stop requested for {instance_uuid}", flush=True)
                return
            except Exception as exc:
                print(f"watchdog stop attempt {attempt + 1}: {exc}", flush=True)
                time.sleep(15)


if __name__ == "__main__":
    main()
