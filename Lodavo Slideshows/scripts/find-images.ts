/**
 * Find a photo for a slideshow slide, and look at it before choosing.
 *
 *   npm run find-images -- "antilia mumbai" [--pinterest] [--tall] [--n 12]
 *
 * Searches the web's pictures through Bing, which indexes the same images as Google and
 * Pinterest and, unlike either, answers a script without an API key. --pinterest keeps to
 * pins, which are mostly portrait, the shape a 3:4 slide wants; --tall asks for portrait
 * images anywhere.
 *
 * Dropped before you see them: stock-photo previews (watermarked), and anything that
 * would be stretched more than 2x to cover a 1080x1440 slide. Every candidate shown has
 * been fetched once, so a spec printed here downloads at render time; when the site
 * itself refuses a script, the spec points at Bing's cached copy instead.
 *
 * Writes a numbered contact sheet to output/image-search/<query>.jpg, the same list as
 * JSON beside it, and prints the spec to paste into the slideshow YAML:
 *
 *   image: { url: "https://..." }
 */
import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { RENDER_LAUNCH_OPTIONS } from "./lib/puppeteer";
import {
  REPO,
  UA,
  dataUri,
  downloadTo,
  fetchOk,
  wikimediaSized,
} from "./lib/slideImages";

interface Hit {
  url: string;
  page: string;
  thumb: string;
  w: number;
  h: number;
  title: string;
}

// Their previews carry a watermark across the middle of the frame.
const STOCK =
  /alamy\.|gettyimages\.|istockphoto\.|shutterstock\.|dreamstime\.|123rf\.|depositphotos\.|ftcdn\.net|stock\.adobe\.|bigstockphoto\.|agefotostock\.|superstock\.|vectorstock\.|canstockphoto\.|stocksy\.|pond5\.|masterfile\.|stockfood\./i;

// How much a 1080x1440 cover crop would stretch the image. Past 2x it reads soft.
const stretch = (w: number, h: number) => Math.max(1080 / w, 1440 / h);

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

async function bing(
  q: string,
  tall: boolean,
): Promise<(Hit & { cdn?: string })[]> {
  const filters =
    "+filterui:imagesize-large" + (tall ? "+filterui:aspect-tall" : "");
  const params = new URLSearchParams({
    q,
    first: "0",
    count: "35",
    adlt: "moderate",
    mmasync: "1",
    qft: filters,
  });
  const html = await (
    await fetchOk(`https://www.bing.com/images/async?${params}`)
  ).text();
  const hits: (Hit & { cdn?: string })[] = [];
  for (const [tag] of html.matchAll(/<a [^>]*class="iusc"[^>]*>/g)) {
    const m = tag.match(/\bm="([^"]+)"/);
    const href = tag.match(/\bhref="([^"]+)"/);
    if (!m || !href) continue;
    let meta: any;
    try {
      meta = JSON.parse(decode(m[1]));
    } catch {
      continue;
    }
    const qs = new URLSearchParams(decode(href[1]).split("?")[1] || "");
    hits.push({
      url: meta.murl,
      page: meta.purl || "",
      thumb: meta.turl,
      w: Number(qs.get("expw")) || 0,
      h: Number(qs.get("exph")) || 0,
      title: meta.t || "",
      cdn: qs.get("cdnurl") || undefined,
    });
  }
  return hits;
}

// Does this URL hand a script an image? Fetches the headers only.
async function serves(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    await res.body?.cancel();
    return res.ok && /^image\//.test(res.headers.get("content-type") || "");
  } catch {
    return false;
  }
}

// The address to use for a hit: the biggest rendition the site serves, or Bing's copy.
async function resolve(h: Hit & { cdn?: string }): Promise<string | undefined> {
  const tries: string[] = [];
  if (/^https:\/\/upload\.wikimedia\.org\//.test(h.url))
    tries.push(wikimediaSized(h.url, 3840, h.w || Infinity));
  // Pins come back as a 736px rendition; the same path under /originals/ is full size.
  if (/i\.pinimg\.com\/\d+x\//.test(h.url))
    tries.push(
      h.url.replace(/i\.pinimg\.com\/\d+x\//, "i.pinimg.com/originals/"),
    );
  tries.push(h.url);
  if (h.cdn) tries.push(h.cdn);
  for (const u of tries) if (await serves(u)) return u;
  return undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const n = Number(opt("--n") || 12);
  const words = args
    .filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--n")
    .join(" ");
  if (!words) {
    console.error(
      'Usage: npm run find-images -- "search words" [--pinterest] [--tall] [--n 12]',
    );
    process.exit(1);
  }
  const q = args.includes("--pinterest")
    ? `${words} site:pinterest.com`
    : words;

  const seen = new Set<string>();
  const candidates = (await bing(q, args.includes("--tall"))).filter((h) => {
    if (!h.url || seen.has(h.url)) return false;
    seen.add(h.url);
    if (STOCK.test(h.url) || STOCK.test(h.page)) return false;
    return !h.w || !h.h || stretch(h.w, h.h) <= 2;
  });

  // A few at a time, in Bing's order, until there are enough that download.
  const hits: Hit[] = [];
  for (let i = 0; i < candidates.length && hits.length < n; i += 4) {
    const batch = candidates.slice(i, i + 4);
    const urls = await Promise.all(batch.map(resolve));
    batch.forEach((h, j) => {
      if (urls[j] && hits.length < n) hits.push({ ...h, url: urls[j]! });
    });
  }
  if (!hits.length) {
    console.log(
      `No usable results for "${q}" (too small, stock, or the site refused). Try other words.`,
    );
    return;
  }

  const dir = path.join(REPO, "output/image-search");
  fs.mkdirSync(dir, { recursive: true });
  // Previews come from Bing's thumbnail server, so they never hit the sites themselves.
  const thumbs: (string | undefined)[] = [];
  for (const [i, h] of hits.entries()) {
    const file = path.join(dir, ".thumbs", `${Date.now()}-${i}.jpg`);
    try {
      await downloadTo(h.thumb, file, 480);
      thumbs.push(file);
    } catch {
      thumbs.push(undefined);
    }
  }

  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const tiles = hits
    .map(
      (h, i) =>
        `<div class="t">${thumbs[i] ? `<img src="${dataUri(thumbs[i]!)}">` : `<div class="x">no preview</div>`}` +
        `<b>${i + 1}</b><p>${h.w}×${h.h} · ${esc(host(h.page || h.url))}<br>${esc(h.title.slice(0, 40))}</p></div>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{margin:0;background:#16161a;font:15px system-ui;color:#ddd}
    .g{display:grid;grid-template-columns:repeat(4,300px);gap:14px;padding:14px}
    .t{position:relative}.t img,.x{width:300px;height:400px;object-fit:cover;display:block;border-radius:6px;background:#333}
    .x{display:grid;place-items:center}
    b{position:absolute;top:8px;left:8px;background:#000c;color:#fff;font-size:26px;padding:2px 10px;border-radius:6px}
    p{margin:6px 2px 0;line-height:1.3}</style></head>
    <body><div class="g">${tiles}</div></body></html>`;

  const slug = words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const sheet = path.join(dir, `${slug}.jpg`);
  const browser = await puppeteer.launch(RENDER_LAUNCH_OPTIONS);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 4 * 300 + 5 * 14, height: 600 });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({
      path: sheet,
      type: "jpeg",
      quality: 82,
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
  for (const t of thumbs) if (t) fs.rmSync(t, { force: true });
  fs.writeFileSync(
    path.join(dir, `${slug}.json`),
    JSON.stringify(
      hits.map((h, i) => ({
        n: i + 1,
        url: h.url,
        page: h.page,
        w: h.w,
        h: h.h,
        title: h.title,
      })),
      null,
      1,
    ),
  );

  console.log(
    `Contact sheet: ${path.relative(REPO, sheet)} (list: ${slug}.json)\n`,
  );
  hits.forEach((h, i) =>
    console.log(
      `${String(i + 1).padStart(2)}  { url: "${h.url}" }  ${h.w}×${h.h}  ${host(h.page || h.url)}`,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
