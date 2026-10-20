import type { LaunchOptions } from "puppeteer";

/**
 * Launch options for the renderer. `--disable-gpu` forces Chrome's software rasterizer,
 * which makes a render reproducible: the GPU rasterizer is not bit-stable, so the same
 * slide rendered twice came out different. With it, re-rendering unchanged input gives
 * identical bytes. --force-color-profile=srgb keeps a P3 screen from tinting the output.
 */
export const RENDER_LAUNCH_OPTIONS: LaunchOptions = {
  headless: true,
  protocolTimeout: 120000,
  args: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--in-process-gpu",
    "--force-color-profile=srgb",
  ],
};
