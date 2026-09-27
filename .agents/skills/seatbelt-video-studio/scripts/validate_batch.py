#!/usr/bin/env python3
"""Compatibility entry point for older seatbelt validation commands."""
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).resolve().parents[2] / "ecommerce-video-studio" / "scripts" / "validate_batch.py"), run_name="__main__")
