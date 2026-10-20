/**
 * Slide images: resolve a YAML image spec to a local file.
 *
 *   { url: <https://...> }  any picture on the web (Google Images, Pinterest, a news
 *                           photo), found with `npm run find-images` or copied from a
 *                           browser with "Copy Image Address".
 *   { file: <path> }        our own art (app screens, photos we took), relative to the repo.
 *
 * Every image lands in output/.slide-images/ as a downscaled JPEG, so a re-render never
 * downloads twice and the slide document stays light.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

export const REPO = path.resolve(__dirname, "../..");
const CACHE = path.join(REPO, "output/.slide-images");

// Wikimedia blocks anonymous clients; its policy asks for a UA that says who is asking.
export const UA = "LodavoSlideshow/1.0 (+https://www.lodavo.com)";

export type ImageSpec = { url: string } | { file: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Image hosts rate-limit, and a batch render asks for a few dozen photos back to back.
// A 429 or 503 is a "slow down", not a failure: back off and retry.
export async function fetchOk(
  url: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  for (const backoff of [3000, 10000, 30000, 0]) {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
    if (res.ok) return res;
    if (![429, 503].includes(res.status) || !backoff)
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    await wait(backoff);
  }
  throw new Error(`gave up on ${url}`);
}

/**
 * Download `url`, then downscale it into the cache as a JPEG with sharp. 2600px on the
 * long edge keeps a 4:3 landscape at 1950 tall, more than a 1440-tall slide needs to cover
 * it without upscaling.
 */
export async function downloadTo(
  url: string,
  dest: string,
  maxEdge = 2600,
): Promise<void> {
  const res = await fetchOk(url);
  const tmp = `${dest}.download`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  try {
    await shrink(tmp, dest, maxEdge);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Upright (phone photos store their rotation as a tag), at most maxEdge, as JPEG.
async function shrink(
  src: string,
  dest: string,
  maxEdge: number,
): Promise<void> {
  await sharp(src)
    .rotate()
    .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toFile(dest);
}

/**
 * A Wikimedia rendition of `width` pixels, or the original when it's no bigger. Commons
 * originals run to 30 MB; its image servers only serve these standard widths
 * (mediawiki.org/wiki/Common_thumbnail_sizes) and reject anything else.
 */
export function wikimediaSized(
  url: string,
  width: number,
  origWidth = Infinity,
): string {
  // Some links carry Commons' utm_* tracking query on the file URL.
  const clean = url.split("?")[0];
  const m = clean.match(
    /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(\w)\/(\w\w)\/([^/]+)$/,
  );
  if (!m || origWidth <= width) return clean;
  const [, a, ab, file] = m;
  const thumb = `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${file}/${width}px-${file}`;
  return /\.(tiff?|svg)$/i.test(file) ? `${thumb}.jpg` : thumb;
}

const cached = (key: string) => path.join(CACHE, `${key}.jpg`);

/** The cache key for a web image. Exported so a cache can be seeded under it. */
export const urlKey = (url: string): string =>
  `url-${createHash("sha1").update(url).digest("hex").slice(0, 16)}`;

async function fromUrl(url: string): Promise<string> {
  const file = cached(urlKey(url));
  if (!fs.existsSync(file)) {
    try {
      await downloadTo(url, file);
    } catch (e) {
      throw new Error(
        `can't download ${url} (${e instanceof Error ? e.message : e}): pick another image`,
      );
    }
  }
  return file;
}

async function fromFile(file: string): Promise<string> {
  const abs = path.resolve(REPO, file);
  if (!fs.existsSync(abs)) throw new Error(`image file not found: ${file}`);
  const stamp = fs.statSync(abs).mtimeMs.toFixed(0);
  const key = `file-${path.basename(abs).replace(/\W+/g, "-")}-${stamp}`;
  if (!fs.existsSync(cached(key))) {
    fs.mkdirSync(CACHE, { recursive: true });
    await shrink(abs, cached(key), 2600);
  }
  return cached(key);
}

/** The local path of a slide's image, downloading it on first use. */
export async function resolveImage(spec: ImageSpec): Promise<string> {
  if ("url" in spec) return fromUrl(spec.url);
  if ("file" in spec) return fromFile(spec.file);
  throw new Error(`unknown image spec: ${JSON.stringify(spec)}`);
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** setContent gives the page an opaque origin, which blocks file://. Inline instead. */
export function dataUri(file: string): string {
  const mime = MIME[path.extname(file).toLowerCase()] || "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}
