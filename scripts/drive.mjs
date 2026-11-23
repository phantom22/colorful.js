// Drives the app in GPU-accelerated Chromium with phone-style touch input.
//
//   import { open } from "./scripts/drive.mjs";
//   const app = await open({ phone: true });
//   await app.swipe([120, 30], [300, 30]);
//   await app.shot("out.png");
//   await app.close();
//
// Or run directly for a smoke test: node scripts/drive.mjs [--headed] [--desktop]
//
// Chromium is the snap build. Headless only gets the GPU through ANGLE's
// Vulkan backend; without it WebGL falls back to SwiftShader (CPU, very slow).

import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROMIUM = process.env.CHROMIUM ?? "/snap/bin/chromium";
const GPU_ARGS = ["--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist", "--enable-gpu"];

const PHONE = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** opens index.html. phone: touch + coarse pointer + phone viewport. */
export async function open({ phone = true, headed = false, url } = {}) {
    const browser = await chromium.launch({ executablePath: CHROMIUM, headless: !headed, args: GPU_ARGS });
    const context = await browser.newContext(phone ? PHONE : DESKTOP);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url ?? pathToFileURL(path.join(ROOT, "index.html")).href);
    const cdp = await context.newCDPSession(page);

    /** raw CDP touch. points: [[x, y], ...] in CSS px; one entry per finger. */
    const touch = (type, points = []) => cdp.send("Input.dispatchTouchEvent", {
        type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })),
    });

    /** moves every finger from `from` to `to` over `ms`, in `steps` moves. */
    async function drag(from, to, { ms = 250, steps = 12, hold = 0 } = {}) {
        await touch("touchStart", from);
        if (hold) await sleep(hold);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            await touch("touchMove", from.map(([x, y], k) => [x + (to[k][0] - x) * t, y + (to[k][1] - y) * t]));
            await sleep(ms / steps);
        }
        await touch("touchEnd");
    }

    const app = {
        browser, context, page, cdp, errors,
        touch,
        /** single finger tap. */
        tap: async (x, y) => { await touch("touchStart", [[x, y]]); await sleep(40); await touch("touchEnd"); },
        /** finger down, held still, then lifted. */
        longPress: async (x, y, ms = 700) => { await touch("touchStart", [[x, y]]); await sleep(ms); await touch("touchEnd"); },
        /** one finger from a to b. */
        swipe: (a, b, opts) => drag([a], [b], opts),
        /** any number of fingers, each from[i] -> to[i]. */
        drag,
        /** two fingers spreading (scale > 1) or pinching (< 1) around a center. */
        pinch: ([cx, cy], d0, scale, opts) => drag(
            [[cx - d0 / 2, cy], [cx + d0 / 2, cy]],
            [[cx - d0 * scale / 2, cy], [cx + d0 * scale / 2, cy]], opts),
        /** center of the first element matching a selector, in CSS px. */
        center: async sel => {
            const b = await page.locator(sel).first().boundingBox();
            if (!b) throw new Error(`not visible: ${sel}`);
            return [b.x + b.width / 2, b.y + b.height / 2];
        },
        /** WebGL renderer string; SwiftShader means no GPU. */
        renderer: () => page.evaluate(() => {
            const gl = document.createElement("canvas").getContext("webgl2");
            const e = gl?.getExtension("WEBGL_debug_renderer_info");
            return gl ? gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : "no webgl2";
        }),
        /** frames per second measured with requestAnimationFrame over `ms`. */
        fps: (ms = 2000) => page.evaluate(ms => new Promise(res => {
            let n = 0; const t0 = performance.now();
            const f = t => { n++; t - t0 < ms ? requestAnimationFrame(f) : res(n * 1000 / (t - t0)); };
            requestAnimationFrame(f);
        }), ms),
        /** waits for n animation frames. */
        frames: n => page.evaluate(n => new Promise(res => {
            const f = () => --n > 0 ? requestAnimationFrame(f) : res();
            requestAnimationFrame(f);
        }), n),
        shot: file => page.screenshot({ path: file }),
        close: () => browser.close(),
    };
    return app;
}

// smoke test
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const headed = process.argv.includes("--headed"), phone = !process.argv.includes("--desktop");
    const app = await open({ phone, headed });
    await app.frames(30);
    console.log("renderer:", await app.renderer());
    console.log("pointer coarse:", await app.page.evaluate(() => matchMedia("(pointer: coarse)").matches));
    console.log("fps:", (await app.fps()).toFixed(1));
    const vp = app.page.viewportSize();
    await app.swipe([vp.width * 0.2, vp.height * 0.5], [vp.width * 0.8, vp.height * 0.6]);
    await app.frames(10);
    if (app.errors.length) console.log("page errors:", app.errors);
    await app.close();
}
