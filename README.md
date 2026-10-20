# SlideGen

Turn a topic into a 6-slide TikTok photo-mode carousel. Built for Lodavo's content team.

## Quickstart

```bash
pip install -r requirements.txt
playwright install chromium
export ANTHROPIC_API_KEY=sk-ant-...
python slidegen.py "how to budget on $400 a week"
```

Output lands in `out/<slug>-<timestamp>/` — open `preview.html` to see all 6 slides.

## Usage

```bash
# Single topic
python slidegen.py "TFSA vs RRSP for students"

# 3 variants of the same topic
python slidegen.py "best student bank accounts" --n 3

# Just brainstorm hooks
python slidegen.py "students leaving money in chequing accounts" --hooks-only

# Batch mode (one topic per line)
python slidegen.py --batch topics.txt

# Clean card style instead of bold
python slidegen.py "meal prep on a budget" --style clean

# Custom brand file
python slidegen.py "textbook savings" --brand my-brand.json
```

## Output

Each run creates a folder with:
- `slide_1.png` to `slide_6.png` (1080x1350, 5:4 TikTok photo mode)
- `caption.txt` (caption + hashtags, copy-paste to TikTok)
- `copy.json` (all generated text + alt hooks)
- `preview.html` (contact sheet for review)

## Brand Config

Edit `brand.json` to set colors, fonts, voice, CTA, and banned phrases. The `model` field controls which Claude model generates copy.

## Design

Four template styles:
- **bold** (default) — Big type on solid color, high impact
- **clean** — Card layout, softer feel
- **promo** — App store style with phone mockup, floating cards, number balls
- **native** — Matches Lodavo's actual slideshow format: TikTok Sans, black-outlined text, full-bleed photos, phone mockup on the last slide only, 3:4 (1080x1440)

Both respect TikTok safe zones (top 150px, bottom 380px, right 120px).
