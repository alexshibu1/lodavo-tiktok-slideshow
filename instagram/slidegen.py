#!/usr/bin/env python3
"""SlideGen — Turn a topic into a 6-slide TikTok carousel."""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import anthropic
import jinja2
from playwright.sync_api import sync_playwright


BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / "templates"
OUT_DIR = BASE_DIR / "out"

SLIDE_ROLES = ["HOOK", "PROBLEM_OR_STAT", "VALUE", "VALUE", "VALUE", "CTA"]
WORD_LIMITS = [10, 18, 22, 22, 22, 15]


# ── Brand ────────────────────────────────────────────────────────────────

def load_brand(path: str | None) -> dict:
    brand_path = Path(path) if path else BASE_DIR.parent / "brand" / "brand.json"
    if not brand_path.exists():
        print(f"Error: brand file not found at {brand_path}", file=sys.stderr)
        print("Create brand.json or pass --brand path/to/brand.json", file=sys.stderr)
        sys.exit(1)
    with open(brand_path) as f:
        return json.load(f)


# ── Validation ───────────────────────────────────────────────────────────

def count_words(text: str) -> int:
    return len(text.split())


def validate_copy(data: dict, brand: dict) -> list[str]:
    errors = []

    if "slides" not in data or len(data["slides"]) != 6:
        errors.append(f"Expected 6 slides, got {len(data.get('slides', []))}")
        return errors

    for i, slide in enumerate(data["slides"]):
        if "role" not in slide or "headline" not in slide:
            errors.append(f"Slide {i+1} missing 'role' or 'headline'")
            continue

        full_text = slide["headline"]
        if slide.get("body"):
            full_text += " " + slide["body"]
        wc = count_words(full_text)
        limit = WORD_LIMITS[i]
        if wc > limit:
            errors.append(f"Slide {i+1} ({slide['role']}): {wc} words, max {limit}")

    if "caption" not in data:
        errors.append("Missing 'caption'")
    elif len(data["caption"]) > 150:
        errors.append(f"Caption is {len(data['caption'])} chars, max 150")

    hashtags = data.get("hashtags", [])
    if not (5 <= len(hashtags) <= 8):
        errors.append(f"Expected 5-8 hashtags, got {len(hashtags)}")

    if "hook_alternatives" not in data or len(data.get("hook_alternatives", [])) < 3:
        errors.append("Need at least 3 hook_alternatives")

    banned = [p.lower() for p in brand.get("banned_phrases", [])]
    all_text = json.dumps(data).lower()
    for phrase in banned:
        if phrase in all_text:
            errors.append(f"Banned phrase found: '{phrase}'")

    return errors


# ── Copy generation ──────────────────────────────────────────────────────

def build_prompt(topic: str, brand: dict) -> str:
    voice_adj = ", ".join(brand["voice"]["adjectives"])
    do_rules = "\n".join(f"  - {r}" for r in brand["voice"]["do"])
    dont_rules = "\n".join(f"  - {r}" for r in brand["voice"]["dont"])
    banned = ", ".join(f'"{p}"' for p in brand["banned_phrases"])

    return f"""You are a short-form content writer for {brand['name']}: {brand['one_line_pitch']}
Audience: {brand['audience']}.
Voice: {voice_adj}.
Do:
{do_rules}
Don't:
{dont_rules}

Write a 6-slide TikTok photo carousel about: "{topic}"

SLIDE STRUCTURE (follow exactly):
1. HOOK — A curiosity or tension line. Max 10 words total. No clickbait lies.
2. PROBLEM_OR_STAT — The relatable student pain. Max 18 words total.
3. VALUE — One concrete tip, number or example. Max 22 words total.
4. VALUE — One concrete tip, number or example. Max 22 words total.
5. VALUE — One concrete tip, number or example. Max 22 words total.
6. CTA — Tie back to {brand['name']} naturally. Use "{brand['cta_text']}". Max 15 words total.

RULES:
- Write like a 21-year-old student talking to a friend. Short sentences.
- Never invent statistics. If you use a stat, set "needs_verification": true on that slide.
- No financial advice framing, no guaranteed returns or promises.
- BANNED PHRASES (never use any of these): {banned}
- Each slide has a "headline" (the main large text) and an optional "body" (smaller supporting text). The word limit applies to headline + body combined.
- The caption must be under 150 characters (not words).
- Provide 5 to 8 hashtags relevant to Canadian students and the topic.
- Provide exactly 3 alternative hook options in hook_alternatives.

Return ONLY valid JSON, no markdown fences, no explanation. Schema:
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
  "hashtags": ["#...", "#...", ...],
  "hook_alternatives": ["...", "...", "..."]
}}"""


def generate_copy(topic: str, brand: dict, client: anthropic.Anthropic) -> dict:
    model = brand.get("model", "claude-sonnet-5-5")
    prompt = build_prompt(topic, brand)

    for attempt in range(2):
        extra = ""
        if attempt == 1:
            extra = f"\n\nPREVIOUS ATTEMPT FAILED VALIDATION. Fix these errors:\n"
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
            print(f"Error: could not parse model output as JSON after retry", file=sys.stderr)
            sys.exit(1)

        errors = validate_copy(data, brand)
        if not errors:
            return data

        if attempt == 0:
            prev_errors = errors
            print(f"  Validation failed, retrying: {errors}")
            continue

        print(f"  Warning: validation still has issues after retry: {errors}", file=sys.stderr)
        return data

    return data


def generate_hooks(topic: str, brand: dict, client: anthropic.Anthropic, count: int = 10) -> list[str]:
    model = brand.get("model", "claude-sonnet-5-5")
    prompt = f"""You write hooks for TikTok carousels for {brand['name']} ({brand['one_line_pitch']}).
Audience: {brand['audience']}.
Voice: {", ".join(brand["voice"]["adjectives"])}.

Generate {count} hook options for a carousel about: "{topic}"

Rules:
- Max 10 words each
- Curiosity or tension, no clickbait lies
- Write like a 21-year-old student
- No banned phrases: {", ".join(brand["banned_phrases"])}

Return a JSON array of strings. No explanation, no markdown."""

    response = client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
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

    return json.loads(text)


# ── Rendering ────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", slug).strip("-")[:50]


def get_slide_class(role: str) -> str:
    if role == "HOOK":
        return "hook-slide"
    elif role == "CTA":
        return "cta-slide"
    return "regular-slide"


def get_role_label(role: str) -> str:
    labels = {
        "HOOK": "Hook",
        "PROBLEM_OR_STAT": "The Problem",
        "VALUE": "Tip",
        "CTA": "Take Action",
    }
    return labels.get(role, role)


def lighten_color(hex_color: str, factor: float = 0.12) -> str:
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r = min(255, int(r + (255 - r) * factor))
    g = min(255, int(g + (255 - g) * factor))
    b = min(255, int(b + (255 - b) * factor))
    return f"#{r:02x}{g:02x}{b:02x}"


PHOTO_GRADIENTS = [
    "linear-gradient(155deg, #0a0a3a 0%, #1a08d6 30%, #0f0060 65%, #060028 100%)",
    "linear-gradient(170deg, #1a0a5e 0%, #2d1b8e 35%, #0a0040 70%, #050020 100%)",
    "linear-gradient(165deg, #0d0040 0%, #1500aa 40%, #08003a 75%, #030018 100%)",
    "linear-gradient(160deg, #120050 0%, #2200b3 30%, #0a0045 65%, #040020 100%)",
    "linear-gradient(175deg, #08002e 0%, #1a0090 35%, #0d0050 70%, #050025 100%)",
    "linear-gradient(150deg, #0f0055 0%, #2a10b0 40%, #0b0040 70%, #040020 100%)",
]

GLOW_CONFIGS = [
    {"c1": "#3300cc", "p1": "-80px; left: -80px", "c2": "#ffd700", "p2": "bottom: 100px; right: -60px", "c3": "#2200b3", "p3": "top: 600px; left: 300px"},
    {"c1": "#4400dd", "p1": "80px; right: -100px", "c2": "#2a10b0", "p2": "bottom: 200px; left: -80px", "c3": "#ffd700", "p3": "top: 400px; right: 200px"},
    {"c1": "#2200b3", "p1": "-60px; left: 200px", "c2": "#3b22d6", "p2": "bottom: 0px; right: 100px", "c3": "#1a00aa", "p3": "top: 500px; left: -60px"},
    {"c1": "#ffd700", "p1": "100px; left: -100px", "c2": "#3300cc", "p2": "bottom: 150px; right: -80px", "c3": "#2200b3", "p3": "top: 350px; left: 400px"},
    {"c1": "#1a08d6", "p1": "-50px; right: 100px", "c2": "#4400dd", "p2": "bottom: 50px; left: 100px", "c3": "#ffd700", "p3": "top: 700px; right: -40px"},
    {"c1": "#3b22d6", "p1": "50px; left: 100px", "c2": "#ffd700", "p2": "bottom: 300px; right: 200px", "c3": "#2a10b0", "p3": "top: 200px; left: -80px"},
]


def native_font_size(text: str, is_hook: bool, is_app: bool, has_photo: bool = False) -> int:
    n = count_words(text)
    if is_hook:
        pct = 0.13 if n <= 6 else 0.112 if n <= 10 else 0.094
    elif is_app:
        pct = 0.074 if n <= 8 else 0.064 if n <= 12 else 0.054
    elif has_photo:
        pct = 0.074 if n <= 5 else 0.064 if n <= 12 else 0.054
    else:
        pct = 0.1 if n <= 5 else 0.086 if n <= 8 else 0.074 if n <= 12 else 0.064
    return round(1080 * pct)


def _load_asset_uri(rel_path: str, mime: str) -> str | None:
    import base64
    p = BASE_DIR / rel_path
    if not p.exists():
        return None
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()


def render_slides(data: dict, brand: dict, style: str, output_dir: Path):
    import base64
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR)))
    template = env.get_template(f"{style}.html")

    bg = brand["colors"]["bg"]
    fg = brand["colors"]["fg"]
    accent = brand["colors"]["accent"]
    heading_font = brand["fonts"]["heading"]
    body_font = brand["fonts"]["body"]

    card_bg = lighten_color(bg, 0.08) if style == "clean" else bg

    logo_path = brand.get("logo_svg")
    logo_data_uri = None
    if logo_path:
        logo_file = BASE_DIR / logo_path
        if logo_file.exists():
            svg_data = logo_file.read_text()
            logo_data_uri = "data:image/svg+xml;base64," + base64.b64encode(svg_data.encode()).decode()

    app_icon_uri = None
    app_icon_path = BASE_DIR / "brand" / "lodavo-app-icon.png"
    if app_icon_path.exists():
        icon_bytes = app_icon_path.read_bytes()
        app_icon_uri = "data:image/png;base64," + base64.b64encode(icon_bytes).decode()

    is_native = style == "native"
    viewport_h = 1440 if is_native else 1350

    native_assets = {}
    if is_native:
        native_assets["tiktok_font"] = _load_asset_uri("brand/TikTokSans-Variable.ttf", "font/ttf")
        native_assets["hero_phone"] = _load_asset_uri("brand/hero-en.webp", "image/webp")
        native_assets["cta_phone"] = _load_asset_uri("brand/cta-en.webp", "image/webp")
        native_assets["sparkles"] = _load_asset_uri("brand/celebration-sparkles.webp", "image/webp")
        native_assets["app_store"] = _load_asset_uri("brand/app-store-en.png", "image/png")
        native_assets["google_play"] = _load_asset_uri("brand/google-play-en.png", "image/png")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1080, "height": viewport_h})

        for i, slide in enumerate(data["slides"]):
            if is_native:
                is_hook = i == 0
                is_app = slide["role"] == "CTA"
                has_photo = False
                full_text = slide["headline"]
                if slide.get("body"):
                    full_text += " " + slide["body"]
                fs = native_font_size(slide["headline"], is_hook, is_app, has_photo)
                if is_app:
                    text_pos = "pos-app"
                elif has_photo:
                    text_pos = "pos-upper"
                else:
                    text_pos = "pos-middle"

                glows = GLOW_CONFIGS[i % len(GLOW_CONFIGS)]
                html = template.render(
                    tiktok_font=native_assets["tiktok_font"],
                    sparkles_image=native_assets["sparkles"],
                    font_size=fs,
                    is_hook=is_hook,
                    is_app=is_app,
                    end_white=False,
                    headline=slide["headline"],
                    body=slide.get("body"),
                    text_pos=text_pos,
                    slide_number=i + 1,
                    total_slides=len(data["slides"]),
                    needs_verification=slide.get("needs_verification", False),
                    show_verify=False,
                    bg_image=None,
                    bg_gradient=PHOTO_GRADIENTS[i % len(PHOTO_GRADIENTS)],
                    bg_focus="50% 50%",
                    glow_color_1=glows["c1"],
                    glow_pos_1=glows["p1"],
                    glow_color_2=glows["c2"],
                    glow_pos_2=glows["p2"],
                    glow_color_3=glows["c3"],
                    glow_pos_3=glows["p3"],
                    phone_image=native_assets["hero_phone"] if is_app else None,
                    show_badges=False,
                    badges_top=0,
                    app_store_badge=native_assets["app_store"],
                    google_play_badge=native_assets["google_play"],
                )
            else:
                html = template.render(
                    bg=bg, fg=fg, accent=accent,
                    heading_font=heading_font, body_font=body_font,
                    card_bg=card_bg,
                    slide_number=i + 1,
                    total_slides=6,
                    slide_class=get_slide_class(slide["role"]),
                    slide_role=slide["role"],
                    slide_role_label=get_role_label(slide["role"]),
                    headline=slide["headline"],
                    body=slide.get("body"),
                    needs_verification=slide.get("needs_verification", False),
                    show_verify=False,
                    handle=brand.get("handle"),
                    disclaimer=brand.get("disclaimer_text"),
                    logo_svg=logo_data_uri,
                    app_icon=app_icon_uri,
                )

            page.set_content(html, wait_until="networkidle")
            page.wait_for_timeout(500)
            page.screenshot(path=str(output_dir / f"slide_{i+1}.png"))

        browser.close()


def render_preview(data: dict, brand: dict, style: str, output_dir: Path, topic: str):
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR)))
    template = env.get_template("preview.html")

    has_verification = any(s.get("needs_verification") for s in data["slides"])

    html = template.render(
        topic=topic,
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
        style=style,
        slides=data["slides"],
        caption=data["caption"],
        hashtags=data["hashtags"],
        has_verification_needed=has_verification,
        hook_alternatives=data.get("hook_alternatives", []),
    )

    (output_dir / "preview.html").write_text(html)


# ── CLI ──────────────────────────────────────────────────────────────────

def run_single(topic: str, brand: dict, client: anthropic.Anthropic, style: str) -> Path:
    slug = slugify(topic)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = OUT_DIR / f"{slug}-{ts}"
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"  Generating copy...")
    data = generate_copy(topic, brand, client)

    print(f"  Rendering {style} slides...")
    render_slides(data, brand, style, output_dir)

    print(f"  Building preview...")
    render_preview(data, brand, style, output_dir, topic)

    (output_dir / "copy.json").write_text(json.dumps(data, indent=2))

    caption_text = data["caption"] + "\n\n" + " ".join(data["hashtags"])
    (output_dir / "caption.txt").write_text(caption_text)

    print(f"  Done → {output_dir}")
    return output_dir


def main():
    parser = argparse.ArgumentParser(
        description="SlideGen — TikTok carousel generator"
    )
    parser.add_argument("topic", nargs="?", help="Topic for the carousel")
    parser.add_argument("--n", type=int, default=1, help="Number of carousel variants")
    parser.add_argument("--hooks-only", action="store_true", help="Print 10 hook options only")
    parser.add_argument("--batch", type=str, help="Path to topics file (one per line)")
    parser.add_argument("--brand", type=str, default=None, help="Path to brand.json")
    parser.add_argument("--style", choices=["bold", "clean", "promo", "native"], default="bold", help="Template style")
    args = parser.parse_args()

    if not args.topic and not args.batch:
        parser.error("Provide a topic or --batch topics.txt")

    if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        print("Error: No Anthropic credentials found.", file=sys.stderr)
        print("Set one of:", file=sys.stderr)
        print("  export ANTHROPIC_API_KEY=sk-ant-...", file=sys.stderr)
        print("  export ANTHROPIC_AUTH_TOKEN=...", file=sys.stderr)
        sys.exit(1)

    brand = load_brand(args.brand)
    client = anthropic.Anthropic()

    if args.hooks_only:
        topic = args.topic
        if not topic:
            parser.error("--hooks-only requires a topic")
        print(f"\nHook options for: {topic}\n")
        hooks = generate_hooks(topic, brand, client)
        for i, hook in enumerate(hooks, 1):
            print(f"  {i:2}. {hook}")
        return

    if args.batch:
        batch_path = Path(args.batch)
        if not batch_path.exists():
            print(f"Error: batch file not found: {batch_path}", file=sys.stderr)
            sys.exit(1)
        topics = [line.strip() for line in batch_path.read_text().splitlines() if line.strip()]
    else:
        topics = [args.topic]

    for topic in topics:
        for variant in range(args.n):
            label = f"[{topic}]"
            if args.n > 1:
                label += f" (variant {variant + 1}/{args.n})"
            print(f"\n{label}")
            run_single(topic, brand, client, args.style)


if __name__ == "__main__":
    main()
