import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const CAMPAIGNS = path.resolve(__dirname, "../campaigns");
const folders = ["editorial-magazine", "lists", "aesthetic-warm"];

async function renderCarousel(htmlPath: string, outDir: string) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  const fileUrl = "file://" + path.resolve(htmlPath);
  await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(
    "document.fonts && document.fonts.ready.then(() => true)",
    { timeout: 10000 }
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  const slideCount = await page.evaluate(() =>
    document.querySelectorAll(".slide").length
  );

  if (slideCount === 0) {
    console.log(`  ⚠ No .slide elements found in ${path.basename(htmlPath)}`);
    await browser.close();
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < slideCount; i++) {
    await page.evaluate((idx) => {
      const slides = document.querySelectorAll<HTMLElement>(".slide");
      document.body.innerHTML = "";
      document.body.style.cssText =
        "margin:0;padding:0;width:1080px;height:1350px;overflow:hidden;background:#000;";
      const slide = slides[idx];
      slide.style.cssText =
        "width:1080px;height:1350px;position:relative;overflow:hidden;transform:none;display:flex;flex-direction:column;";
      document.body.appendChild(slide);
    }, i);

    await new Promise((r) => setTimeout(r, 2000));

    const outPath = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.jpg`);
    await page.screenshot({
      path: outPath,
      type: "jpeg",
      quality: 92,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
    });

    if (i < slideCount - 1) {
      await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log(`  ✓ ${path.basename(htmlPath)}: ${slideCount} slides → ${outDir}`);
  await browser.close();
}

async function main() {
  for (const folder of folders) {
    const dir = path.join(CAMPAIGNS, folder);
    if (!fs.existsSync(dir)) continue;

    const htmlFiles = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".html"))
      .sort();

    console.log(`\n${folder}/ (${htmlFiles.length} carousels)`);

    for (const file of htmlFiles) {
      const slug = file.replace(/\.html$/, "");
      const outDir = path.join(CAMPAIGNS, folder, "output", slug);
      await renderCarousel(path.join(dir, file), outDir);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
