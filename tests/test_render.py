"""Smoke test: render one slide to verify the Playwright + Jinja2 pipeline."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from slidegen import render_slides, render_preview, load_brand

SAMPLE_DATA = {
    "slides": [
        {"role": "HOOK", "headline": "Your bank is robbing you", "body": None, "needs_verification": False},
        {"role": "PROBLEM_OR_STAT", "headline": "68% of students pay bank fees", "body": "they don't even know about", "needs_verification": True},
        {"role": "VALUE", "headline": "Switch to a no-fee account", "body": "Most banks have free student options", "needs_verification": False},
        {"role": "VALUE", "headline": "Set up auto-transfers weekly", "body": "Even $25/week adds up fast", "needs_verification": False},
        {"role": "VALUE", "headline": "Track spending in one app", "body": "Know where every dollar goes", "needs_verification": False},
        {"role": "CTA", "headline": "Save smarter starting today", "body": "Download Lodavo free — link in bio", "needs_verification": False},
    ],
    "caption": "Stop letting your bank win",
    "hashtags": ["#studentlife", "#moneytips", "#canada", "#budgeting", "#savemoney", "#lodavo"],
    "hook_alternatives": ["Banks hate this one trick", "The fee nobody talks about", "Why your chequing account costs you"],
}


def test_render_bold(tmp_path):
    brand = load_brand(None)
    render_slides(SAMPLE_DATA, brand, "bold", tmp_path)
    for i in range(1, 7):
        png = tmp_path / f"slide_{i}.png"
        assert png.exists(), f"slide_{i}.png not created"
        assert png.stat().st_size > 10000, f"slide_{i}.png too small"


def test_render_clean(tmp_path):
    brand = load_brand(None)
    render_slides(SAMPLE_DATA, brand, "clean", tmp_path)
    for i in range(1, 7):
        png = tmp_path / f"slide_{i}.png"
        assert png.exists()


def test_preview(tmp_path):
    brand = load_brand(None)
    render_preview(SAMPLE_DATA, brand, "bold", tmp_path, "test topic")
    assert (tmp_path / "preview.html").exists()
