# Lodavo slideshows

Everything you need to make and post Lodavo's photo slideshows: two posts a day, the same slides on TikTok and Instagram. Your Claude Code agent does the research, writing, photos and rendering. You review each week's posts and post them by hand.

## Set up (once)

1. You need Node.js 20.9 or newer. Run `node -v`; if it's missing or older, install the LTS version from nodejs.org.
2. Unzip this folder somewhere you'll keep it, open a terminal in it, and start Claude Code with `claude`.
3. Paste the setup prompt from Ben's message. The agent installs everything, runs the checks and renders one test post.

## Every week

1. **Results (the weekend before).** Screenshot your TikTok and Instagram grids (the view counts show on every tile), plus the analytics screen of any post that shows where its viewers are from.
2. **The batch.** Give the screenshots to the agent with the weekly prompt from Ben's message. It logs the results, plans 14 posts for Monday to Sunday (12:00 and 19:00 Toronto time), writes them, finds the photos, runs the QA check and renders them.
3. **Review.** Open the review sheet it gives you (`output/slideshow-review/<date>.jpg`), then each post's folder, and look at every slide against the checklist below. Tell the agent what to change; a re-render takes seconds.
4. **Post** two a day, by hand (steps below).

## What to check before you approve

- **Facts.** Every number, name and date on a slide matches a source in the post's YAML (`sources:`). Open a few of them yourself each week.
- **The Lodavo math.** Every $25 saved earns 1 ticket, every week: $100 saved is 4 tickets a week, $500 is 20, $1,000 is 40. Nothing else about the draw unless it's in the contest rules.
- **Photos.** No watermark, no other creator's text or logo, no camera date stamp, no private person's face as the subject, nothing AI-made passed off as real, and the subject isn't cut off.
- **Text.** Readable over the photo and clear of the apps' buttons on the right and the caption area at the bottom. The hook on slide 1 is the biggest text in the post.
- **The last slide.** A plain question and an answer that names Lodavo, plus one small legal line at the bottom (the only one; don't add more).
- **Tone.** It sounds like a person, not an ad. Nothing cringe, nothing calling Lodavo a bank, a lottery or gambling, nothing "safe" or "guaranteed".
- **QA.** No FAIL. The agent lists the WARNs; most are fine, but read them.

## Posting (by hand)

Each post has its own folder in `output/slideshows/`, named by when it goes up, with the slides (`slide-01.jpg` and on) and `caption.txt`.

1. When it's time, AirDrop just that post's slides to your phone, not `caption.txt` (send the text to yourself however you like). The slides are dated so they land at the top of your camera roll in order, so both apps' pickers show slide 1 first. If the order ever looks off, tap them in order yourself: the post follows the order you tap.
2. **TikTok:** a photo post (not a video) with the slides in order and the sound TikTok suggests. The first line of `caption.txt` goes in the title box; everything after the "—" line goes in the description.
3. **Instagram:** a carousel post with the slides in order. Check the preview shows the whole slide (3:4); if it's cropped, change the crop before moving on. Paste all of `caption.txt` as the caption.
4. Don't post through the Edits app: it turns a carousel into a Reel.
5. Tell the agent which posts went up, so it marks them and never re-renders them.

Not on a Mac and an iPhone? Get the slides to your phone any other way (Google Drive, a cable) and tap them in order in the picker.

## If something goes wrong

- **Someone asks for a photo to come down:** take the post down right away on both apps (archive it on Instagram, set it to "Only me" on TikTok) and tell Ben.
- **A fact turns out wrong after posting:** the same, then have the agent fix the YAML.
- **A render or the QA check fails:** paste the error to the agent.
- **Not sure about something in the app or the contest:** ask Ben before it goes in a post.
