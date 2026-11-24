// GPU time per shader pass, per sim step, via timer queries. Usage:
//   node scripts/profile.mjs <sim res> <width> <height> <dpr>
//   env NOAA=1: canvas without MSAA; STORE='{"precision.v-cycles":1}': saved inspector values
// Passes are labeled by their shader id. The sim is uncapped (target fps 1000,
// no vsync) so the GPU stays busy: at 60 steps/s an integrated GPU clocks down
// to fill the frame and every pass reads slower than it is. Times are divided
// by sim steps, not by animation frames (most frames skip the sim when uncapped).
// Serves the unminified bundle so the app's globals keep their names.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = ["--use-angle=vulkan","--enable-features=Vulkan","--ignore-gpu-blocklist","--enable-privileged-webgl-extensions","--enable-webgl-draft-extensions","--disable-gpu-vsync","--disable-frame-rate-limit"];
const hook = () => {
  const P = WebGL2RenderingContext.prototype, names = new Map(); let cur = "?", ext = null, gl0 = null;
  const stats = {}; const pending = [];
  window.__names = names;
  const oUse = P.useProgram; P.useProgram = function (p) { cur = names.get(p) ?? "?"; return oUse.call(this, p); };
  const oDraw = P.drawArrays; P.drawArrays = function (...a) {
    if (!ext) { ext = this.getExtension("EXT_disjoint_timer_query_webgl2"); gl0 = this; }
    if (!ext || !window.__prof) return oDraw.apply(this, a);
    const q = this.createQuery(); this.beginQuery(ext.TIME_ELAPSED_EXT, q);
    const r = oDraw.apply(this, a); this.endQuery(ext.TIME_ELAPSED_EXT);
    pending.push([q, cur]); return r; };
  window.__collect = () => {
    for (let i = pending.length - 1; i >= 0; i--) {
      const [q, n] = pending[i];
      if (gl0.getQueryParameter(q, gl0.QUERY_RESULT_AVAILABLE)) {
        const t = gl0.getQueryParameter(q, gl0.QUERY_RESULT) / 1e6;
        (stats[n] ??= { ms: 0, n: 0 }).ms += t; stats[n].n++; gl0.deleteQuery(q); pending.splice(i, 1);
      }
    }
    return { stats, ext: !!ext };
  };
};
const [res, w, h, dpr] = process.argv.slice(2).map(Number);
const b = await chromium.launch({ executablePath: "/snap/bin/chromium", headless: true, args: ARGS });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
await ctx.addInitScript(hook);
if (process.env.NOAA) await ctx.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { return o.call(this, t, { ...a, antialias: false, alpha: false, depth: false, stencil: false }); }; });
const extra = JSON.parse(process.env.STORE || "{}");
if (process.env.TRIVIAL) await ctx.addInitScript(() => { const o = WebGL2RenderingContext.prototype.shaderSource; WebGL2RenderingContext.prototype.shaderSource = function (sh, src) { if (/source_kind/.test(src) && /o_color/.test(src)) src = src.replace(/void main\(\)\s*\{[\s\S]*$/, "void main() { o_color = vec4(0.0, 0.0, 0.0, 1.0); }"); return o.call(this, sh, src); }; });
await ctx.addInitScript(r => { if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.setItem("fluid_ui_v1", JSON.stringify({ "precision.simulation": r[0], ...r[1] })); } }, [res, extra]);
const p = await ctx.newPage();
await ctx.route(/index\.min\.js$/, r => r.fulfill({ path: path.join(ROOT, "bundle/index.js"), contentType: "text/javascript" }));
await p.goto(pathToFileURL(path.join(ROOT, "index.html")).href);
await p.waitForFunction(() => typeof renderer !== "undefined" && renderer.frame > 2);
await p.evaluate(() => {
  for (const [id, s] of Object.entries(shaders)) __names.set(s.program, id);
  renderer.target_fps = 1000; pacing.refresh = 1000;           // uncapped
  window.__steps = 0; const o = window.sim_step; window.sim_step = function () { __steps++; return o(); };
});
await p.waitForTimeout(1500);
// stir the fluid so it is not idle
await p.mouse.move(w * .2, h * .5); await p.mouse.down();
for (let i = 0; i < 30; i++) { await p.mouse.move(w * (.2 + i * .02), h * (.5 + .2 * Math.sin(i / 4))); await p.waitForTimeout(16); }
await p.mouse.up();
const fps = await p.evaluate(() => new Promise(r => { const s0 = __steps, t0 = performance.now(); setTimeout(() => r((__steps - s0) * 1000 / (performance.now() - t0)), 2000); }));
const steps0 = await p.evaluate(() => { window.__prof = 1; return __steps; });
await p.evaluate(() => new Promise(r => { const s0 = __steps; const f = () => __steps - s0 >= 60 ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }));
const frames = await p.evaluate(s0 => { window.__prof = 0; return __steps - s0; }, steps0); await p.waitForTimeout(500);
const { stats, ext } = await p.evaluate(() => window.__collect());
console.log(`sim ${res}, ${w}x${h}@${dpr}: ${fps.toFixed(0)} sim steps/s uncapped, ${frames} steps timed, timer ext ${ext}`);
const rows = Object.entries(stats).map(([k, v]) => [k, v.ms / frames, v.n / frames]).sort((a, b) => b[1] - a[1]);
const tot = rows.reduce((s, r) => s + r[1], 0);
for (const [k, ms, n] of rows) if (ms > 0.01) console.log(`  ${ms.toFixed(3).padStart(7)} ms  ${(100*ms/tot).toFixed(0).padStart(3)}%  ${n.toFixed(0).padStart(3)} draws  ${k}`);
console.log(`  ${tot.toFixed(3).padStart(7)} ms  total GPU per sim step`);
await b.close();
