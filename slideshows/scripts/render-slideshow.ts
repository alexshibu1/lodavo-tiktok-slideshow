/**
 * Slideshow renderer: photo-led, native-looking slideshows for TikTok photo mode and
 * Instagram carousels. One YAML, one set of slides that goes up on both.
 *
 *   npm run slideshow -- campaigns/2026-10/slideshow-<slug>.yaml [more.yaml ...]
 *
 * Output, one folder per post, named by its slot so a week reads in posting order:
 *   output/slideshows/2026-10-19 Mon 12h00 <slug>/
 *     slide-NN.jpg      1080x1440
 *     caption.txt       the title, a separator line, the caption, the hashtags
 * and, when a run has more than one post, the sheet the week is approved from:
 *   output/slideshow-review/<first slot's date>.jpg
 *
 * Why this format exists: @lodavo.money's branded purple cards (40-60 words a slide)
 * rarely passed 50 views. The app slideshows that do get views are a photo, one short
 * line in the platform's own text style, and a hook that is the biggest thing on screen,
 * with the app held back for the last slide. Content rules:
 * .claude/skills/slideshow/SKILL.md.
 *
 * Size: 3:4, the frame both apps show whole. TikTok's photo view crops a taller photo to
 * its middle 3:4 (the first 9:16 post lost 240px top and bottom there, and its last
 * slide's text went under the search bar), and 3:4 is the tallest an Instagram carousel
 * takes. So the same JPEGs post to both, and the review sheet shows what goes up.
 */
import puppeteer, { type Browser, type Page } from "puppeteer";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import sharp from "sharp";
import { RENDER_LAUNCH_OPTIONS } from "./lib/puppeteer";
import { ON_SCREEN_DISCLAIMER } from "./lib/legal";
import { type ImageSpec, REPO, dataUri, resolveImage } from "./lib/slideImages";

type Lang = "en" | "fr";
type TextStyle = "outline" | "box";
// The two looks under test (the ledger records both). `opening` is a label: an intro is
// slide 1 written as a "here are... 👉" title card. `end` sets the app slide's background.
const OPENINGS = ["cold", "intro"] as const;
const ENDS = ["blue", "white"] as const;

interface Slide {
  text?: string;
  sub?: string;
  image?: ImageSpec;
  focus?: string;
  pos?: "upper" | "middle";
  dim?: number;
  style?: TextStyle;
  color?: string;
  app?: "hero" | "cta";
  badges?: boolean;
}

interface Slideshow {
  slug: string;
  language: Lang;
  account?: string;
  series?: string;
  slot?: string; // "YYYY-MM-DD HH:MM", Toronto time: when it posts
  title?: string; // the caption's first line, when the hook text alone isn't it
  style?: TextStyle;
  opening?: (typeof OPENINGS)[number];
  end?: (typeof ENDS)[number];
  slides: Slide[];
  caption: string;
  hashtags?: string[];
  sources?: string[];
}

// The frame, CSS px. TikTok's photo view puts its back arrow and search bar (or the
// feed's tabs) over the top ~110px and, from about 62% down, its button column over the
// right ~140px; Instagram puts only a "1/8" counter in the top right corner. So text
// starts below the bar and ends above the column, and the legal line sits at the foot,
// narrow enough to stay left of the buttons.
const F = {
  w: 1080,
  h: 1440,
  gutter: 80,
  txtTop: 180,
  txtMaxBottom: 880,
  discBottom: 60,
  discSide: 140,
  phoneTop: 560,
  phoneW: 560,
  phoneWBadges: 460,
};

// The phone art is 969x1188 (two phones, transparent).
const PHONE_RATIO = 1188 / 969;
const ASSETS = path.join(REPO, "templates/slideshow/assets");
const BADGES = ASSETS;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const p2 = (n: number) => String(n).padStart(2, "0");
const slideName = (i: number) => `slide-${p2(i + 1)}.jpg`;

// Phone photo pickers list the newest photo first, and a render has no capture date, so a
// set AirDropped together lands in any order. Each slide gets one instead, slide 1 newest
// and a second apart, two hours after the post's slot: AirDropped when it's time to post,
// the slides open TikTok's and Instagram's pickers in reading order, above anything taken
// since the slot. (The Photos app lists oldest first, so there they read backwards.)
const STAMP_AFTER_SLOT_MS = 2 * 3600 * 1000;

const words = (s = ""): number =>
  s
    .replace(/\*+/g, "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}$]/u.test(w)).length;

/**
 * Starting size as a share of the frame width, by word count: fewer words, bigger type.
 * The hook gets its own, larger scale, and after fitting the renderer makes sure no
 * other slide's text outgrows it (see fitText). The app slide's question keeps the large
 * size up to 8 words: it is the line the post ends on.
 */
function baseFs(text: string | undefined, hook: boolean, app: boolean): number {
  const n = words(text);
  const pct = hook
    ? n <= 6
      ? 0.108
      : n <= 10
        ? 0.094
        : 0.08
    : n <= (app ? 8 : 5)
      ? 0.074
      : n <= 12
        ? 0.064
        : 0.054;
  return Math.round(F.w * pct);
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// esc + *accent* (gold text) + emoji (drawn without the outline) + newlines
function fmt(s?: string): string {
  if (!s) return "";
  return esc(s)
    .replace(/\*(.+?)\*/g, '<span class="hl">$1</span>')
    .replace(
      /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu,
      '<span class="emo">$&</span>',
    )
    .replace(/\n/g, "<br>");
}

function buildCss(): string {
  const dir = path.join(REPO, "templates/slideshow");
  return fs
    .readFileSync(path.join(dir, "slideshow.css"), "utf8")
    .replace(/url\((['"]?)\.\/fonts\/([^'")]+)\1\)/g, (_m, _q, file) => {
      const b64 = fs
        .readFileSync(path.join(dir, "fonts", file))
        .toString("base64");
      return `url(data:font/ttf;base64,${b64})`;
    });
}

function slideHtml(
  s: Slide,
  i: number,
  show: Slideshow,
  img: string | undefined,
  disc: boolean,
): string {
  const lang = show.language;
  const isHook = i === 0;
  const isApp = !!s.app;
  const white = isApp && !img && show.end === "white";
  const style = s.style || show.style || "outline";
  const pos = isApp ? "upper" : s.pos || "upper";
  const fs0 = baseFs(s.text, isHook, isApp);
  const phoneW = s.badges ? F.phoneWBadges : F.phoneW;

  const vars = [
    `--w:${F.w}`,
    `--h:${F.h}`,
    `--gutter:${F.gutter}`,
    `--txt-top:${F.txtTop}`,
    `--disc-bottom:${F.discBottom}`,
    `--disc-side:${F.discSide}`,
    `--phone-top:${F.phoneTop}`,
    `--phone-w:${phoneW}`,
    `--badges-top:${Math.round(F.phoneTop + phoneW * PHONE_RATIO + 26)}`,
    `--shade:${s.dim ?? (isApp && !img ? 0 : 1)}`,
  ].join(";");

  const bg = img
    ? `<img class="bg" src="${dataUri(img)}" style="object-position:${esc(s.focus || "50% 50%")}" alt="">`
    : white
      ? `<div class="white-bg"></div>`
      : isApp
        ? `<div class="brand-bg" style="--sparkles:url(${dataUri(path.join(ASSETS, "celebration-sparkles.webp"))})"></div>`
        : `<div class="brand-bg" style="background:${esc(s.color || "#101014")}"></div>`;

  const txt = s.text
    ? `<div class="txt pos-${pos} style-${style}" style="--fs:${fs0}" data-fs="${fs0}" data-max="${F.txtMaxBottom}">` +
      `<span class="ln">${fmt(s.text)}</span>` +
      (s.sub ? `<span class="sub">${fmt(s.sub)}</span>` : "") +
      `</div>`
    : "";

  const app = isApp
    ? `<img class="phone" src="${dataUri(path.join(ASSETS, `${s.app}-${lang}.webp`))}" alt="">` +
      (s.badges
        ? `<div class="badges">` +
          `<img src="${dataUri(path.join(BADGES, `app-store-${lang === "fr" ? "fr-CA" : "en"}.png`))}" alt="App Store">` +
          `<img src="${dataUri(path.join(BADGES, `google-play-${lang === "fr" ? "fr-CA" : "en"}.png`))}" alt="Google Play">` +
          `</div>`
        : "")
    : "";

  const classes = [
    "slide",
    isApp ? "kind-app" : "kind-photo",
    isHook ? "is-hook" : "",
    pos === "middle" ? "txt-middle" : "",
    white ? "end-white" : "",
    disc ? "has-disc" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<div class="${classes}" style="${vars}">
    ${bg}
    <div class="shade"></div>
    ${txt}
    ${app}
    ${disc ? `<p class="disc">${esc(ON_SCREEN_DISCLAIMER[lang])}</p>` : ""}
  </div>`;
}

/**
 * Fit each text block inside its band, then hold the hook as the biggest type in the
 * post. Feedback on the old account was that "the actual hook isn't big enough, a random
 * part of the text is", so this is enforced, not left to whoever writes the YAML.
 */
async function fitText(page: Page): Promise<void> {
  await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(".txt"));
    for (const el of blocks) {
      const slide = el.closest(".slide") as HTMLElement;
      const top = slide.getBoundingClientRect().top;
      const phone = slide.querySelector(".phone") as HTMLElement | null;
      const max = phone
        ? phone.getBoundingClientRect().top - top - 28
        : Number(el.dataset.max);
      let size = Number(el.dataset.fs);
      while (el.getBoundingClientRect().bottom - top > max && size > 30) {
        size = Math.floor(size * 0.95);
        el.style.setProperty("--fs", String(size));
      }
      el.dataset.final = String(size);
    }
    const hook = document.querySelector<HTMLElement>(".is-hook .txt");
    if (!hook) return;
    const cap = Math.floor(Number(hook.dataset.final) / 1.12);
    for (const el of blocks) {
      if (el === hook) continue;
      if (Number(el.dataset.final) > cap) {
        el.style.setProperty("--fs", String(cap));
        el.dataset.final = String(cap);
      }
    }
  });
}

/** A text block that leaves its band or runs into the phone is not shippable. */
async function auditLayout(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = [];
    document.querySelectorAll<HTMLElement>(".slide").forEach((slide, i) => {
      const box = slide.getBoundingClientRect();
      const txt = slide.querySelector<HTMLElement>(".txt");
      const phone = slide.querySelector<HTMLElement>(".phone");
      const disc = slide.querySelector<HTMLElement>(".disc");
      if (txt) {
        const r = txt.getBoundingClientRect();
        const max = phone
          ? phone.getBoundingClientRect().top - box.top - 20
          : Number(txt.dataset.max);
        if (r.bottom - box.top > max + 1)
          issues.push(
            `slide ${i + 1}: text runs ${Math.round(r.bottom - box.top - max)}px past its band`,
          );
        if (r.top < box.top)
          issues.push(`slide ${i + 1}: text leaves the top of the frame`);
      }
      if (phone && disc) {
        const p = phone.getBoundingClientRect();
        const d = disc.getBoundingClientRect();
        const badges = slide.querySelector<HTMLElement>(".badges");
        const lowest = badges
          ? badges.getBoundingClientRect().bottom
          : p.bottom;
        if (lowest > d.top - 8)
          issues.push(`slide ${i + 1}: the app art runs into the legal line`);
      }
    });
    return issues;
  });
}

/** "2026-10-19 12:00" as a Date in the machine's zone (Toronto time). */
function slotDate(slot: string, file: string): Date {
  const m = slot.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`${file}: slot is "${slot}", use "YYYY-MM-DD HH:MM"`);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/** The JPEG with an EXIF block holding only DateTimeOriginal, after the JFIF header. */
function withCaptureTime(jpeg: Buffer, when: Date): Buffer {
  const stamp =
    `${when.getFullYear()}:${p2(when.getMonth() + 1)}:${p2(when.getDate())} ` +
    `${p2(when.getHours())}:${p2(when.getMinutes())}:${p2(when.getSeconds())}\0`;
  // Little-endian TIFF: header, IFD0 at 8 pointing to the Exif IFD at 26, whose one
  // entry is the 20-byte timestamp stored at 44.
  const tiff = Buffer.alloc(64);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10); // ExifIFDPointer, LONG
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x9003, 28); // DateTimeOriginal, ASCII
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(20, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.write(stamp, 44, "ascii");
  const body = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xffe1, 0);
  marker.writeUInt16BE(body.length + 2, 2);
  const at = jpeg.readUInt16BE(2) === 0xffe0 ? 4 + jpeg.readUInt16BE(4) : 2;
  return Buffer.concat([jpeg.subarray(0, at), marker, body, jpeg.subarray(at)]);
}

/**
 * caption.txt in Ben's layout: the title alone on the first line (TikTok's title box,
 * Instagram's first line), a line holding only a dash, then the caption with a blank line
 * between paragraphs (each line of the YAML caption is one), then at most 5 hashtags
 * (Instagram's cap). No photo credits: nobody on either platform runs them.
 */
function captionText(show: Slideshow, file: string): string {
  const raw = (show.title || show.slides[0].text || "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const title = raw.charAt(0).toUpperCase() + raw.slice(1);
  // TikTok's photo-post title box takes 90 characters.
  const n = [...title].length;
  if (n > 90)
    throw new Error(
      `${file}: the title runs ${n} characters and TikTok takes 90; set a shorter \`title:\``,
    );
  const paras = show.caption
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const tags = (show.hashtags || []).slice(0, 5);
  return (
    [title, "—", ...paras, ...(tags.length ? [tags.join(" ")] : [])].join(
      "\n\n",
    ) + "\n"
  );
}

interface Rendered {
  ok: boolean;
  show: Slideshow;
  dir: string;
  when?: Date;
}

async function renderOne(
  browser: Browser,
  file: string,
  outRoot: string,
): Promise<Rendered> {
  const doc = yaml.load(fs.readFileSync(file, "utf8")) as {
    slideshow: Slideshow;
  };
  const show = doc?.slideshow;
  if (!show?.slug || !show.slides?.length)
    throw new Error(
      `${file}: needs a \`slideshow:\` root with a slug and slides`,
    );
  const last = show.slides.length - 1;
  if (!show.slides[last].app)
    throw new Error(
      `${file}: the last slide must be the app slide (\`app: hero\` or \`app: cta\`)`,
    );

  for (const [key, allowed] of [
    ["opening", OPENINGS],
    ["end", ENDS],
  ] as const)
    if (show[key] && !(allowed as readonly string[]).includes(show[key]!))
      throw new Error(
        `${file}: ${key} is "${show[key]}", use ${allowed.join(" or ")}`,
      );
  const when = show.slot ? slotDate(show.slot, file) : undefined;
  const caption = captionText(show, file);

  // The one piece of legal text a slideshow carries: the on-screen line on the last
  // slide, which is always the app slide, whose screens show the prizes. Ben's call: no
  // legal block in the caption and no line mid-post.
  const disc = show.slides.map((_s, i) => i === last);

  // One at a time, so a first render of a batch doesn't trip a host's rate limit.
  const images: (string | undefined)[] = [];
  for (const s of show.slides)
    images.push(s.image ? await resolveImage(s.image) : undefined);

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: F.w, height: F.h, deviceScaleFactor: 1 });
  const body = show.slides
    .map((s, i) => slideHtml(s, i, show, images[i], disc[i]))
    .join("\n");
  await page.setContent(
    `<!DOCTYPE html><html lang="${show.language}"><head><meta charset="UTF-8"><style>${buildCss()}</style></head><body>${body}</body></html>`,
    { waitUntil: "load" },
  );
  await page.evaluate(
    "(async()=>{try{await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))]);}catch(e){}})()",
  );
  await fitText(page);
  const issues = await auditLayout(page);
  if (issues.length) console.log(`✗ ${show.slug}:\n  ${issues.join("\n  ")}`);

  // A post whose slot moved leaves its old folder behind; there is one folder per slug.
  fs.mkdirSync(outRoot, { recursive: true });
  for (const name of fs.readdirSync(outRoot))
    if (name === show.slug || name.endsWith(` ${show.slug}`))
      fs.rmSync(path.join(outRoot, name), { recursive: true, force: true });
  const dir = path.join(
    outRoot,
    when
      ? `${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())} ` +
          `${DAYS[when.getDay()]} ${p2(when.getHours())}h${p2(when.getMinutes())} ${show.slug}`
      : show.slug,
  );
  fs.mkdirSync(dir, { recursive: true });

  const els = await page.$$(".slide");
  for (let i = 0; i < els.length; i++) {
    const shot = Buffer.from(
      await els[i].screenshot({ type: "jpeg", quality: 90 }),
    );
    const out = path.join(dir, slideName(i));
    if (!when) {
      fs.writeFileSync(out, shot);
      continue;
    }
    const at = new Date(when.getTime() + STAMP_AFTER_SLOT_MS - i * 1000);
    fs.writeFileSync(out, withCaptureTime(shot, at));
    fs.utimesSync(out, at, at);
  }
  await page.close();
  fs.writeFileSync(path.join(dir, "caption.txt"), caption);

  console.log(
    `${issues.length ? "✗" : "✓"} ${show.slug}: ${show.slides.length} slides → ${path.relative(REPO, dir)}`,
  );
  return { ok: !issues.length, show, dir, when };
}

/** One row per post, in slot order: every slide, labelled with the slot and the looks. */
async function reviewSheet(
  browser: Browser,
  posts: Rendered[],
  file: string,
): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "review-"));
  try {
    const rows: string[] = [];
    for (const { show, dir, when } of posts) {
      const thumbs: string[] = [];
      for (let i = 0; i < show.slides.length; i++) {
        const small = path.join(tmp, `${show.slug}-${i}.jpg`);
        await sharp(path.join(dir, slideName(i)))
          .resize(320, 320, { fit: "inside" })
          .toFile(small);
        thumbs.push(`<img src="${dataUri(small)}">`);
      }
      const slot = when
        ? `${DAYS[when.getDay()]} ${MONTHS[when.getMonth()]} ${when.getDate()}, ${p2(when.getHours())}:${p2(when.getMinutes())}`
        : "no slot";
      rows.push(
        `<div class="r"><div class="l"><b>${slot}</b><br>${show.slug}` +
          `${show.series ? `<br>${show.series}` : ""}` +
          `<br>${show.opening || "cold"} · ${show.end || "blue"} end</div>` +
          `<div class="s">${thumbs.join("")}</div></div>`,
      );
    }
    const html = rows.join("");
    const page = await browser.newPage();
    await page.setViewport({ width: 190 + 10 * 224 + 48, height: 400 });
    await page.setContent(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{margin:0;background:#16161a;color:#ddd;font:16px system-ui}
      .r{display:flex;gap:16px;padding:14px 16px;border-bottom:1px solid #333}
      .l{width:190px;flex:none;line-height:1.4;word-break:break-word}
      b{color:#fff}.s{display:flex;gap:8px}
      .s img{width:216px;height:288px;object-fit:cover;border-radius:4px}</style></head>
      <body>${html}</body></html>`,
      { waitUntil: "load" },
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({
      path: file as `${string}.jpg`,
      type: "jpeg",
      quality: 85,
      fullPage: true,
    });
    await page.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const o = args.indexOf("--out");
  const out = path.resolve(
    o >= 0 ? args[o + 1] : path.join(REPO, "output/slideshows"),
  );
  const files = args.filter(
    (a, i) => a.endsWith(".yaml") && args[i - 1] !== "--out",
  );
  if (!files.length) {
    console.error(
      "Usage: npm run slideshow -- <slideshow.yaml> [...] [--out <dir>]",
    );
    process.exit(1);
  }
  const browser = await puppeteer.launch(RENDER_LAUNCH_OPTIONS);
  const done: Rendered[] = [];
  try {
    for (const f of files) done.push(await renderOne(browser, f, out));
    if (done.length > 1) {
      done.sort(
        (a, b) =>
          (a.when?.getTime() ?? Infinity) - (b.when?.getTime() ?? Infinity),
      );
      const first = done[0].when;
      const sheet = path.join(
        path.dirname(out),
        "slideshow-review",
        first
          ? `${first.getFullYear()}-${p2(first.getMonth() + 1)}-${p2(first.getDate())}.jpg`
          : "unscheduled.jpg",
      );
      await reviewSheet(browser, done, sheet);
      console.log(`Review sheet: ${sheet}`);
    }
  } finally {
    await browser.close();
  }
  if (done.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
