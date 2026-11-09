#!/usr/bin/env python3
"""SlideGen Non-Branded — Pinterest-aesthetic TikTok carousels with Lodavo CTA."""

import argparse
import base64
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import anthropic
import jinja2
import requests
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).parent
BRAND_DIR = BASE_DIR.parent / "brand"
TEMPLATES_DIR = BASE_DIR / "templates"
OUT_DIR = BASE_DIR / "out"
CACHE_DIR = BASE_DIR / ".bg-cache"

SLIDE_ROLES = ["HOOK", "PROBLEM_OR_STAT", "VALUE", "VALUE", "VALUE", "CTA"]
WORD_LIMITS = [10, 18, 22, 22, 22, 15]

PLATFORM_DIMS = {
    "tiktok": (1080, 1920),
    "instagram": (1080, 1350),
}

AESTHETIC_GRADIENTS = [
    "linear-gradient(165deg, #1a1410 0%, #2e2620 40%, #4a3f34 100%)",
    "linear-gradient(170deg, #14181a 0%, #252d30 40%, #3d4a4f 100%)",
    "linear-gradient(160deg, #1a1418 0%, #302428 40%, #4a3840 100%)",
    "linear-gradient(175deg, #121418 0%, #1e2830 40%, #344048 100%)",
    "linear-gradient(165deg, #181614 0%, #2c2822 40%, #48403a 100%)",
    "linear-gradient(170deg, #141218 0%, #262030 40%, #3e3648 100%)",
]

BANNED_PHRASES = [
    "in today's fast-paced world", "unlock", "game-changer", "let's dive in",
    "it's no secret", "look no further", "the truth is", "imagine a world",
    "buckle up", "without further ado", "at the end of the day", "leverage",
    "synergy", "paradigm shift", "guaranteed returns", "get rich",
    "financial advice",
]

SCHOOL_CONTEXT = {
    "uoft": {
        "name": "University of Toronto",
        "city": "Toronto",
        "niche": (
            "Robarts Library all-nighters, $18 salads at Sidney Smith, "
            "streetcar TTC commutes, St. George campus rent averaging $1,400/mo, "
            "the Rotman vs Arts & Sci rivalry, CS POST stress, "
            "r/UofT memes about Bell curve adjustments, "
            "Engineering Skule cannon, Trinity College dining hall"
        ),
    },
    "queens": {
        "name": "Queen's University",
        "city": "Kingston",
        "niche": (
            "Homecoming on Aberdeen, CoGro (Common Ground) coffee runs, "
            "the QP (Queen's Pub), living on Division Street, "
            "Wolfe Island ferry trips, r/queensuniversity vibes, "
            "AMS insurance debates, the 'Golden Gaels' hype, "
            "Stauffer Library cramming, Kingston winter survival"
        ),
    },
    "mcgill": {
        "name": "McGill University",
        "city": "Montreal",
        "niche": (
            "Arts Building steps hangouts, Plateau apartment hunting, "
            "McGill ghetto rent wars, $1 dep beers on St-Laurent, "
            "SSMU building drama, r/mcgill pain posts about Samosa Man, "
            "the OAP hill, Milton-Parc nostalgia, "
            "French immersion guilt, Redpath Museum study spots, "
            "SAQ runs and Schwartz's deli lines"
        ),
    },
}


def count_words(text: str) -> int:
    return len(text.split())


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", slug).strip("-")[:50]


PLATFORM_DIMS = {
    "instagram": (1080, 1350),
    "tiktok": (1080, 1920),
}

BG_DIR = BASE_DIR / "backgrounds"


def calc_font_size(text: str, is_hook: bool) -> tuple[int, int]:
    n = count_words(text)
    if is_hook:
        hl = 72 if n <= 5 else 60 if n <= 8 else 50
    else:
        hl = 56 if n <= 5 else 48 if n <= 10 else 40
    return hl, max(32, round(hl * 0.72))


# ── Brand assets (for CTA slide) ────────────────────────────────────

def _asset_uri(path: Path, mime: str) -> str | None:
    if not path.exists():
        return None
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def _svg_uri(path: Path) -> str | None:
    if not path.exists():
        return None
    return "data:image/svg+xml;base64," + base64.b64encode(
        path.read_text().encode()
    ).decode()


def load_brand() -> dict:
    brand_json = BASE_DIR.parent / "brand.json"
    brand = {}
    if brand_json.exists():
        with open(brand_json) as f:
            brand = json.load(f)

    return {
        "brand": brand,
        "logo_uri": _svg_uri(BRAND_DIR / "lodavo-logo.svg"),
        "logomark_uri": _svg_uri(BRAND_DIR / "lodavo-logomark.svg"),
        "app_icon_uri": _asset_uri(BRAND_DIR / "lodavo-app-icon.png", "image/png"),
        "sparkles_uri": _asset_uri(
            BRAND_DIR / "celebration-sparkles.webp", "image/webp"
        ),
        "phone_uri": _asset_uri(BRAND_DIR / "hero-en.webp", "image/webp"),
        "app_store_uri": _asset_uri(BRAND_DIR / "app-store-en.png", "image/png"),
        "google_play_uri": _asset_uri(
            BRAND_DIR / "google-play-en.png", "image/png"
        ),
    }


# ── Background images ───────────────────────────────────────────────

def fetch_picsum(seed: str) -> bytes | None:
    try:
        url = f"https://picsum.photos/seed/{seed}/1080/1920"
        resp = requests.get(url, timeout=20, allow_redirects=True)
        if resp.status_code == 200 and len(resp.content) > 5000:
            return resp.content
    except Exception:
        pass
    return None


def _load_images_from_dir(dirpath: Path, count: int) -> list[dict]:
    images = sorted([
        f for f in dirpath.iterdir()
        if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    ])
    if not images:
        return []
    import random as _rnd
    picked = _rnd.sample(images, min(count, len(images)))
    if len(picked) < count:
        picked = (picked * ((count // len(picked)) + 1))[:count]
    bgs = []
    for img in picked:
        data = img.read_bytes()
        ext = img.suffix.lstrip(".").lower()
        mime = "image/jpeg" if ext in {"jpg", "jpeg"} else f"image/{ext}"
        uri = f"data:{mime};base64," + base64.b64encode(data).decode()
        bgs.append({"type": "image", "uri": uri})
    return bgs


def load_backgrounds(
    topic: str,
    bg_dir: str | None,
    school: str | None = None,
    count: int = 5,
) -> list[dict]:
    """Load backgrounds for slides 1-5 (slide 6 is branded CTA)."""
    if bg_dir:
        result = _load_images_from_dir(Path(bg_dir), count)
        if result:
            return result

    if school:
        school_dir = BG_DIR / school
        if school_dir.is_dir():
            result = _load_images_from_dir(school_dir, count)
            if result:
                return result

    generic_dir = BG_DIR / "generic"
    if generic_dir.is_dir():
        result = _load_images_from_dir(generic_dir, count)
        if result:
            return result

    CACHE_DIR.mkdir(exist_ok=True)
    backgrounds = []
    for i in range(count):
        seed = hashlib.md5(f"{topic}-slide-{i}".encode()).hexdigest()[:10]
        cache_file = CACHE_DIR / f"{seed}.jpg"
        data = None
        if cache_file.exists():
            data = cache_file.read_bytes()
        else:
            print(f"    Downloading background {i + 1}/{count}...")
            data = fetch_picsum(seed)
            if data:
                cache_file.write_bytes(data)
        if data:
            uri = "data:image/jpeg;base64," + base64.b64encode(data).decode()
            backgrounds.append({"type": "image", "uri": uri})
        else:
            backgrounds.append({
                "type": "gradient",
                "css": AESTHETIC_GRADIENTS[i % len(AESTHETIC_GRADIENTS)],
            })
    return backgrounds


# ── Validation ───────────────────────────────────────────────────────

def validate_copy(data: dict) -> list[str]:
    errors = []
    if "slides" not in data or len(data["slides"]) != 6:
        errors.append(f"Expected 6 slides, got {len(data.get('slides', []))}")
        return errors

    for i, slide in enumerate(data["slides"]):
        if "role" not in slide or "headline" not in slide:
            errors.append(f"Slide {i + 1} missing 'role' or 'headline'")
            continue
        full_text = slide["headline"]
        if slide.get("body"):
            full_text += " " + slide["body"]
        wc = count_words(full_text)
        limit = WORD_LIMITS[i]
        if wc > limit:
            errors.append(
                f"Slide {i + 1} ({slide['role']}): {wc} words, max {limit}"
            )

    if "caption" not in data:
        errors.append("Missing 'caption'")
    elif len(data["caption"]) > 150:
        errors.append(f"Caption is {len(data['caption'])} chars, max 150")

    hashtags = data.get("hashtags", [])
    if not (5 <= len(hashtags) <= 8):
        errors.append(f"Expected 5-8 hashtags, got {len(hashtags)}")

    all_text = json.dumps(data).lower()
    for phrase in BANNED_PHRASES:
        if phrase.lower() in all_text:
            errors.append(f"Banned phrase found: '{phrase}'")

    return errors


# ── Copy generation ──────────────────────────────────────────────────

def build_prompt(topic: str, brand: dict, school: str | None = None) -> str:
    banned = ", ".join(f'"{p}"' for p in BANNED_PHRASES)
    cta_text = brand.get("cta_text", "Download Lodavo free — link in bio")

    school_info = ""
    audience = "Canadian university students (18-25)"
    if school and school in SCHOOL_CONTEXT:
        ctx = SCHOOL_CONTEXT[school]
        audience = f"{ctx['name']} students in {ctx['city']} (18-25)"
        school_info = f"""
SCHOOL-SPECIFIC CONTEXT (use naturally, don't force every reference):
References/culture: {ctx['niche']}
Weave in 1-2 of these per slide where it fits. The audience should feel like
this was made by someone who actually goes to {ctx['name']}."""

    return f"""You are a short-form content writer creating aesthetic, scroll-stopping TikTok carousels.
Audience: {audience}.
Voice: friendly, relatable, sharp, helpful. Like a smart friend sharing tips.
{school_info}
Write a 6-slide TikTok photo carousel about: "{topic}"

SLIDE STRUCTURE (follow exactly):
1. HOOK — A curiosity or tension line. Max 10 words total. Short and punchy.
2. PROBLEM_OR_STAT — The relatable student pain. Max 18 words total.
3. VALUE — One concrete tip, number or example. Max 22 words total.
4. VALUE — One concrete tip, number or example. Max 22 words total.
5. VALUE — One concrete tip, number or example. Max 22 words total.
6. CTA — Tie back to Lodavo (a free prize-linked savings app for Canadian students). Use "{cta_text}". Max 15 words total.

RULES:
- Write like a 21-year-old student talking to a friend. Short sentences.
- Slides 1-5 should NOT mention any brand or app. Keep them generic and valuable.
- Only slide 6 mentions Lodavo.
- Never invent statistics. If you use a stat, set "needs_verification": true.
- No financial advice framing.
- BANNED PHRASES: {banned}
- Each slide has a "headline" (main large text) and optional "body" (smaller text). Word limit = headline + body combined.
- Caption must be under 150 characters.
- Provide 5-8 hashtags for Canadian students.

Return ONLY valid JSON:
{{
  "slides": [
    {{"role": "HOOK", "headline": "...", "body": null, "needs_verification": false}},
    {{"role": "PROBLEM_OR_STAT", "headline": "...", "body": "...", "needs_verification": false}},
    {{"role": "VALUE", "headline": "...", "body": "...", "needs_verification": false}},
    {{"role": "VALUE", "headline": "...", "body": "...", "needs_verification": false}},
    {{"role": "VALUE", "headline": "...", "body": "...", "needs_verification": false}},
    {{"role": "CTA", "headline": "...", "body": null, "needs_verification": false}}
  ],
  "caption": "...",
  "hashtags": ["#...", "#..."]
}}"""


def generate_copy(
    topic: str,
    brand: dict,
    client: anthropic.Anthropic,
    school: str | None = None,
) -> dict:
    prompt = build_prompt(topic, brand, school)
    model = brand.get("model", "claude-sonnet-5-5")
    prev_errors: list[str] = []

    for attempt in range(2):
        extra = ""
        if attempt == 1:
            extra = "\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n"
            extra += "\n".join(f"- {e}" for e in prev_errors)
            extra += "\n\nReturn corrected JSON only."

        response = client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt + extra}],
        )

        text = ""
        for block in response.content:
            if block.type == "text":
                text += block.text

        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            text = text.strip()

        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            if attempt == 0:
                prev_errors = [f"Invalid JSON: {e}"]
                continue
            print("Error: could not parse JSON after retry", file=sys.stderr)
            sys.exit(1)

        errors = validate_copy(data)
        if not errors:
            return data

        if attempt == 0:
            prev_errors = errors
            print(f"  Validation failed, retrying: {errors}")
            continue

        print(f"  Warning: issues after retry: {errors}", file=sys.stderr)
        return data

    return data


# ── Rendering ────────────────────────────────────────────────────────

def render_slides(
    data: dict,
    backgrounds: list[dict],
    brand_assets: dict,
    output_dir: Path,
    platform: str = "instagram",
):
    w, h = PLATFORM_DIMS.get(platform, (1080, 1350))
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR))
    )
    template = env.get_template("aesthetic.html")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": w, "height": h})

        for i, slide in enumerate(data["slides"]):
            is_cta = i == 5
            hl_size, body_size = calc_font_size(slide["headline"], i == 0)

            if is_cta:
                bg = {"type": "brand"}
            else:
                bg = (
                    backgrounds[i]
                    if i < len(backgrounds)
                    else {
                        "type": "gradient",
                        "css": AESTHETIC_GRADIENTS[i % len(AESTHETIC_GRADIENTS)],
                    }
                )

            html = template.render(
                canvas_w=w,
                canvas_h=h,
                bg_type=bg["type"],
                bg_image=bg.get("uri"),
                bg_gradient=bg.get("css"),
                headline=slide["headline"],
                body=slide.get("body"),
                font_size=hl_size,
                body_font_size=body_size,
                slide_index=i,
                total_slides=6,
                is_hook=(i == 0),
                is_cta=is_cta,
                logo_uri=brand_assets.get("logo_uri"),
                logomark_uri=brand_assets.get("logomark_uri"),
                app_icon_uri=brand_assets.get("app_icon_uri"),
                sparkles_uri=brand_assets.get("sparkles_uri"),
                phone_uri=brand_assets.get("phone_uri"),
                app_store_uri=brand_assets.get("app_store_uri"),
                google_play_uri=brand_assets.get("google_play_uri"),
                brand_bg=brand_assets.get("brand", {}).get("colors", {}).get(
                    "bg", "#0A0033"
                ),
                brand_accent=brand_assets.get("brand", {}).get(
                    "colors", {}
                ).get("accent", "#FFD700"),
                disclaimer=brand_assets.get("brand", {}).get(
                    "disclaimer_text", ""
                ),
            )

            page.set_content(html, wait_until="networkidle")
            page.wait_for_timeout(800)
            page.screenshot(path=str(output_dir / f"slide_{i + 1}.png"))

        browser.close()


def render_preview(data: dict, output_dir: Path, topic: str):
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR))
    )
    template = env.get_template("preview.html")

    html = template.render(
        topic=topic,
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
        slides=data["slides"],
        caption=data["caption"],
        hashtags=data["hashtags"],
    )

    (output_dir / "preview.html").write_text(html)


# ── CLI ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SlideGen — Pinterest-aesthetic TikTok carousels"
    )
    parser.add_argument("topic", nargs="?", help="Topic for the carousel")
    parser.add_argument("--n", type=int, default=1, help="Number of variants")
    parser.add_argument("--batch", type=str, help="Topics file (one per line)")
    parser.add_argument(
        "--bg-dir",
        type=str,
        help="Directory of background images (e.g. saved from Pinterest)",
    )
    parser.add_argument(
        "--school",
        type=str,
        choices=list(SCHOOL_CONTEXT.keys()),
        help="Target a specific university (uoft, queens, mcgill)",
    )
    parser.add_argument(
        "--platform",
        type=str,
        choices=list(PLATFORM_DIMS.keys()),
        default="instagram",
        help="Output format: instagram (1080x1350) or tiktok (1080x1920)",
    )
    parser.add_argument(
        "--examples",
        action="store_true",
        help="Generate example carousels for generic + each school",
    )
    args = parser.parse_args()

    if args.examples:
        args.topic = args.topic or "how to save money as a student"

    if not args.topic and not args.batch:
        parser.error("Provide a topic or --batch topics.txt")

    if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get(
        "ANTHROPIC_AUTH_TOKEN"
    ):
        print(
            "Error: Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN",
            file=sys.stderr,
        )
        sys.exit(1)

    client = anthropic.Anthropic()
    brand_assets = load_brand()
    brand = brand_assets.get("brand", {})

    if args.batch:
        batch_path = Path(args.batch)
        if not batch_path.exists():
            print(f"Error: batch file not found: {batch_path}", file=sys.stderr)
            sys.exit(1)
        topics = [
            l.strip() for l in batch_path.read_text().splitlines() if l.strip()
        ]
    else:
        topics = [args.topic]

    if args.examples:
        runs = [
            (topics[0], None, "generic"),
            (topics[0], "uoft", "uoft"),
            (topics[0], "queens", "queens"),
            (topics[0], "mcgill", "mcgill"),
        ]
    else:
        runs = [(t, args.school, None) for t in topics]

    for topic, school, tag in runs:
        for variant in range(args.n):
            school_label = f" ({SCHOOL_CONTEXT[school]['name']})" if school else ""
            label = f"[{topic}{school_label}]"
            if tag:
                label = f"[example: {tag}] {topic}"
            if args.n > 1:
                label += f" (variant {variant + 1}/{args.n})"
            print(f"\n{label}")

            slug = slugify(topic)
            if school:
                slug = f"{school}-{slug}"
            if tag:
                slug = f"example-{tag}-{slug}"
            ts = datetime.now().strftime("%Y%m%d-%H%M%S")
            output_dir = OUT_DIR / f"{slug}-{ts}"
            output_dir.mkdir(parents=True, exist_ok=True)

            print("  Fetching backgrounds...")
            backgrounds = load_backgrounds(
                topic, args.bg_dir, school=school, count=5
            )

            print("  Generating copy...")
            data = generate_copy(topic, brand, client, school)

            print("  Rendering slides...")
            render_slides(data, backgrounds, brand_assets, output_dir, args.platform)

            print("  Building preview...")
            render_preview(data, output_dir, topic)

            (output_dir / "copy.json").write_text(json.dumps(data, indent=2))
            caption_text = data["caption"] + "\n\n" + " ".join(data["hashtags"])
            (output_dir / "caption.txt").write_text(caption_text)

            print(f"  Done -> {output_dir}")


if __name__ == "__main__":
    main()
