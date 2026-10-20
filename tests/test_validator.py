"""Tests for the SlideGen JSON validator."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from slidegen import validate_copy, count_words


BRAND = {
    "banned_phrases": ["game-changer", "let's dive in", "unlock"],
    "cta_text": "Download Lodavo — link in bio",
}


def _make_valid():
    return {
        "slides": [
            {"role": "HOOK", "headline": "Your bank is stealing from you", "needs_verification": False},
            {"role": "PROBLEM_OR_STAT", "headline": "Most students lose hundreds a year", "body": "in fees they never notice", "needs_verification": False},
            {"role": "VALUE", "headline": "Switch to a no-fee account", "body": "Most big banks have student options", "needs_verification": False},
            {"role": "VALUE", "headline": "Set up auto-transfers", "body": "Even $25 a week adds up fast", "needs_verification": False},
            {"role": "VALUE", "headline": "Track everything in one place", "body": "Use an app to see where money goes", "needs_verification": False},
            {"role": "CTA", "headline": "Start saving smarter today", "body": "Download Lodavo — link in bio", "needs_verification": False},
        ],
        "caption": "Stop letting your bank win",
        "hashtags": ["#studentlife", "#moneytips", "#canada", "#budgeting", "#savemoney"],
        "hook_alternatives": ["Banks hate this trick", "Why your account is bleeding money", "The fee you keep ignoring"],
    }


def test_valid_data_passes():
    assert validate_copy(_make_valid(), BRAND) == []


def test_wrong_slide_count():
    data = _make_valid()
    data["slides"] = data["slides"][:4]
    errors = validate_copy(data, BRAND)
    assert any("Expected 6 slides" in e for e in errors)


def test_word_limit_hook():
    data = _make_valid()
    data["slides"][0]["headline"] = "This is way too many words for a hook line that should be short and punchy"
    errors = validate_copy(data, BRAND)
    assert any("Slide 1" in e and "words" in e for e in errors)


def test_word_limit_value():
    data = _make_valid()
    data["slides"][2]["headline"] = " ".join(["word"] * 15)
    data["slides"][2]["body"] = " ".join(["extra"] * 10)
    errors = validate_copy(data, BRAND)
    assert any("Slide 3" in e for e in errors)


def test_caption_too_long():
    data = _make_valid()
    data["caption"] = "x" * 200
    errors = validate_copy(data, BRAND)
    assert any("Caption" in e for e in errors)


def test_wrong_hashtag_count():
    data = _make_valid()
    data["hashtags"] = ["#one", "#two"]
    errors = validate_copy(data, BRAND)
    assert any("hashtags" in e for e in errors)


def test_too_many_hashtags():
    data = _make_valid()
    data["hashtags"] = [f"#{i}" for i in range(12)]
    errors = validate_copy(data, BRAND)
    assert any("hashtags" in e for e in errors)


def test_missing_hook_alternatives():
    data = _make_valid()
    data["hook_alternatives"] = ["one"]
    errors = validate_copy(data, BRAND)
    assert any("hook_alternatives" in e for e in errors)


def test_banned_phrase_detected():
    data = _make_valid()
    data["slides"][2]["headline"] = "This is a game-changer for students"
    errors = validate_copy(data, BRAND)
    assert any("game-changer" in e for e in errors)


def test_banned_phrase_case_insensitive():
    data = _make_valid()
    data["slides"][2]["headline"] = "Let's Dive In to budgeting"
    errors = validate_copy(data, BRAND)
    assert any("let's dive in" in e for e in errors)


def test_count_words():
    assert count_words("hello world") == 2
    assert count_words("one") == 1
    assert count_words("a b c d e f g h i j") == 10
    assert count_words("") == 0


def test_missing_fields():
    data = _make_valid()
    del data["slides"][0]["headline"]
    errors = validate_copy(data, BRAND)
    assert any("missing" in e.lower() for e in errors)
