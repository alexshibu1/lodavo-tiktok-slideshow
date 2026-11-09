#!/usr/bin/env python3
"""Generate example carousels using hardcoded copy (no API needed)."""

import json
from datetime import datetime
from pathlib import Path
from slidegen import render_slides, render_preview, load_brand, slugify, OUT_DIR

EXAMPLES = [
    {
        "topic": "how to budget on $400 a week",
        "data": {
            "slides": [
                {"role": "HOOK", "headline": "$400 a week. Here's how.", "body": None, "needs_verification": False},
                {"role": "PROBLEM_OR_STAT", "headline": "Most students blow through their money by Wednesday", "body": "and eat ramen til Friday", "needs_verification": False},
                {"role": "VALUE", "headline": "Split it: 50/30/20", "body": "$200 needs, $120 wants, $80 savings", "needs_verification": False},
                {"role": "VALUE", "headline": "Meal prep Sundays", "body": "Cook 5 lunches for ~$25. That's $5 each", "needs_verification": False},
                {"role": "VALUE", "headline": "Use student discounts everywhere", "body": "UNiDAYS, SPC, campus deals. Flash that student ID", "needs_verification": False},
                {"role": "CTA", "headline": "Save $25 and win cash weekly", "body": "Download Lodavo free — link in bio", "needs_verification": False},
            ],
            "caption": "Broke by Wednesday? Not anymore",
            "hashtags": ["#studentbudget", "#moneytips", "#canada", "#budgeting", "#savemoney", "#lodavo", "#studentlife"],
            "hook_alternatives": ["$400/week is enough. Seriously.", "Stop being broke by Wednesday", "The budget that actually works"],
        },
    },
    {
        "topic": "students leaving money in chequing accounts",
        "data": {
            "slides": [
                {"role": "HOOK", "headline": "Your chequing account pays you $0", "body": None, "needs_verification": False},
                {"role": "PROBLEM_OR_STAT", "headline": "Money sitting in chequing loses value every single day", "body": "inflation eats it while you sleep", "needs_verification": False},
                {"role": "VALUE", "headline": "Open a HISA", "body": "High-interest savings accounts pay 4-5% right now", "needs_verification": True},
                {"role": "VALUE", "headline": "Automate the split", "body": "Pay hits → bills to chequing, rest to savings. Set it once", "needs_verification": False},
                {"role": "VALUE", "headline": "Your savings can win you cash", "body": "Every $25 saved = a free weekly draw ticket on Lodavo", "needs_verification": False},
                {"role": "CTA", "headline": "Make your savings work harder", "body": "Download Lodavo free — link in bio", "needs_verification": False},
            ],
            "caption": "Your money is losing value while you scroll",
            "hashtags": ["#savingmoney", "#studentfinance", "#canada", "#hisa", "#lodavo", "#moneymoves", "#chequing"],
            "hook_alternatives": ["Your bank thanks you for the free loan", "Chequing = parking lot for your money", "$0 interest is not a flex"],
        },
    },
    {
        "topic": "TFSA vs RRSP for students",
        "data": {
            "slides": [
                {"role": "HOOK", "headline": "TFSA or RRSP? Wrong answer costs you", "body": None, "needs_verification": False},
                {"role": "PROBLEM_OR_STAT", "headline": "Most students pick the wrong one because nobody explains it simply", "body": None, "needs_verification": False},
                {"role": "VALUE", "headline": "TFSA: tax-free growth", "body": "Put money in after tax. It grows and you never pay tax on gains", "needs_verification": False},
                {"role": "VALUE", "headline": "RRSP: tax refund now", "body": "Deduct contributions from income. But you pay tax when you withdraw", "needs_verification": False},
                {"role": "VALUE", "headline": "Students: TFSA wins", "body": "Your income is low now. RRSP deductions save you almost nothing", "needs_verification": False},
                {"role": "CTA", "headline": "Start your TFSA and win cash", "body": "Download Lodavo free — link in bio", "needs_verification": False},
            ],
            "caption": "TFSA first. Always. Here's why",
            "hashtags": ["#tfsa", "#rrsp", "#studentfinance", "#canada", "#investing", "#lodavo", "#moneytips", "#personalfinance"],
            "hook_alternatives": ["RRSP at 21? Probably a mistake", "The account every student needs first", "TFSA vs RRSP in 30 seconds"],
        },
    },
]

NATIVE_EXAMPLES = [
    {
        "topic": "7 money moves that slap at 22",
        "data": {
            "slides": [
                {"role": "HOOK", "headline": "7 money moves that slap at 22", "body": None, "needs_verification": False},
                {"role": "VALUE", "headline": "your credit score is already ticking", "body": "and every missed payment stays for 6 years", "needs_verification": False},
                {"role": "VALUE", "headline": "a TFSA is a tax shelter, not a piggy bank", "body": "stocks, ETFs, crypto, all tax-free inside it", "needs_verification": False},
                {"role": "VALUE", "headline": "$100 a month starting now", "body": "is worth more than $500 a month starting at 35", "needs_verification": False},
                {"role": "VALUE", "headline": "OSAP interest kicks in the second you graduate", "body": "and it compounds while you figure out life", "needs_verification": False},
                {"role": "CTA", "headline": "Have $25 saved anywhere?", "body": "On Lodavo, that earns you a free jackpot ticket every week", "needs_verification": False},
            ],
            "caption": "7 money moves that slap at 22",
            "hashtags": ["#lodavo", "#moneytok", "#canada", "#personalfinance", "#studentlife"],
            "hook_alternatives": ["money things nobody warned you about at 22", "the 7 money facts that actually matter in your 20s", "I wish someone told me these at 18"],
        },
    },
    {
        "topic": "how much rent costs across Canada right now",
        "data": {
            "slides": [
                {"role": "HOOK", "headline": "Canadian rent prices that don't seem real", "body": None, "needs_verification": False},
                {"role": "VALUE", "headline": "Vancouver: $2,800", "body": "for a one-bedroom, and that's if you find one", "needs_verification": True},
                {"role": "VALUE", "headline": "Toronto: $2,500", "body": "a basement apartment if you're lucky", "needs_verification": True},
                {"role": "VALUE", "headline": "Montreal: $1,650", "body": "the last major city where rent doesn't ruin you", "needs_verification": True},
                {"role": "VALUE", "headline": "Calgary: $1,700", "body": "went up 20% in a single year", "needs_verification": True},
                {"role": "CTA", "headline": "Saving for your own place?", "body": "Every $25 you save earns a free jackpot ticket on Lodavo", "needs_verification": False},
            ],
            "caption": "Canadian rent prices that don't seem real",
            "hashtags": ["#lodavo", "#canadarent", "#moneytok", "#canada", "#housingcrisis"],
            "hook_alternatives": ["guess the rent in 6 Canadian cities", "rent across Canada, October 2026", "the rent map that'll make you move to Montreal"],
        },
    },
    {
        "topic": "the wildest lottery wins in Canadian history",
        "data": {
            "slides": [
                {"role": "HOOK", "headline": "he found out he won $75 million in a coffee drive-thru", "body": None, "needs_verification": False},
                {"role": "VALUE", "headline": "checking the OLG app in line for coffee", "body": "he read $75,000. it was $75 million. Kingston, 2025", "needs_verification": True},
                {"role": "VALUE", "headline": "went to Walmart for burger buns", "body": "came home with an $80 million ticket. Canada's biggest solo win", "needs_verification": True},
                {"role": "VALUE", "headline": "arrived in Canada with $300 in his pocket", "body": "won $5 million in Brampton. bought a ticket on a whim", "needs_verification": True},
                {"role": "VALUE", "headline": "his third Lotto 6/49 ticket ever", "body": "$1.6 million jackpot share. Quebec, 2025", "needs_verification": True},
                {"role": "CTA", "headline": "Lottery tickets cost money.", "body": "Lodavo's are free: every $25 you save earns a jackpot ticket", "needs_verification": False},
            ],
            "caption": "Canada's wildest lottery wins, all true. Which one is the craziest?",
            "hashtags": ["#lodavo", "#lottomax", "#lotto649", "#lotterywinner", "#canada"],
            "hook_alternatives": ["$75 million from a drive-thru coffee run", "Canadian lottery stories that sound fake but aren't", "the luckiest people in Canadian history"],
        },
    },
]


def main():
    brand = load_brand(None)

    for example in EXAMPLES:
        topic = example["topic"]
        data = example["data"]
        slug = slugify(topic)

        for style in ["bold", "clean", "promo"]:
            ts = datetime.now().strftime("%Y%m%d-%H%M%S")
            output_dir = OUT_DIR / f"{slug}-{style}-{ts}"
            output_dir.mkdir(parents=True, exist_ok=True)

            print(f"Rendering [{style}]: {topic}")
            render_slides(data, brand, style, output_dir)
            render_preview(data, brand, style, output_dir, topic)
            (output_dir / "copy.json").write_text(json.dumps(data, indent=2))
            caption_text = data["caption"] + "\n\n" + " ".join(data["hashtags"])
            (output_dir / "caption.txt").write_text(caption_text)
            print(f"  → {output_dir}")

    for example in NATIVE_EXAMPLES:
        topic = example["topic"]
        data = example["data"]
        slug = slugify(topic)

        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        output_dir = OUT_DIR / f"{slug}-native-{ts}"
        output_dir.mkdir(parents=True, exist_ok=True)

        print(f"Rendering [native]: {topic}")
        render_slides(data, brand, "native", output_dir)
        render_preview(data, brand, "native", output_dir, topic)
        (output_dir / "copy.json").write_text(json.dumps(data, indent=2))
        caption_text = data["caption"] + "\n\n" + " ".join(data["hashtags"])
        (output_dir / "caption.txt").write_text(caption_text)
        print(f"  → {output_dir}")


if __name__ == "__main__":
    main()
