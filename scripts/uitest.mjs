// UI interaction tests: desktop (mouse + keyboard), phone (touch), the real
// minified bundle, and the scene features (undo, saving, help overlay).
//
//   npm run build && node scripts/uitest.mjs
//
// Most suites load bundle/index.js (unminified: top-level names are globals,
// so app state can be inspected) in place of bundle/index.min.js. The
// "minified" suite and the persistence checks run the real bundle and only
// look at what the page shows: the minifier renames properties, which is
// where bugs like a NaN brush radius hide. Takes about 3 minutes.
import { open } from "./drive.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = pathToFileURL(path.join(ROOT, "index.html")).href;
const SRC = fs.readFileSync(`${ROOT}/bundle/index.js`, "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
let current = "";

async function boot(phone) {
    const app = await open({ phone, url: "about:blank" });
    await app.page.route("**/bundle/index.min.js", r => r.fulfill({ contentType: "text/javascript", body: SRC }));
    await app.page.goto(INDEX);
    await app.page.evaluate(() => localStorage.clear());
    await app.page.reload();
    await app.frames(20);
    return app;
}

function check(name, ok, detail = "") {
    results.push({ suite: current, name, ok, detail });
    console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

const S = (app, f, arg) => app.page.evaluate(f, arg);
const state = app => S(app, () => ({
    m1: mouse.m1_down, m2: mouse.m2_down, rclick: mouse.geyser_rclick, mode: mouse.mode,
    gmode: geysers.mode, drag: !!geysers.drag, n: geysers.list.length, editing: !!geysers.editing,
    hover: !!geysers.hover, force: force.is_active, center: [...force.center], span: force.span,
    arrows: fluid.display.arrows, borders: fluid.open_borders, pal: stroke.palette_color,
    shift: keyboard.shift_down, ctrl: keyboard.ctrl_down, ui_hidden: ui_container.hidden,
    glsl: ui_field_glsl.is_open, wall_erase: obstacle_splat.erase_mode, line: obstacle_splat.line_mode,
    queue: splat.queue.length,
    dye_r: brushes.dye_radius, push_r: brushes.force_radius, wall_r: brushes.wall_radius,
    over: mouse.over_canvas, client_known: mouse.client_known,
}));
const geyser_px = (app, i) => S(app, i => uv_screen(geysers.list[i].uv), i);
const errs = app => app.errors.filter(e => !/favicon/.test(e));

// ---------------------------------------------------------------- desktop
async function desktop() {
    current = "desktop"; console.log("\n== desktop (mouse + keyboard)");
    const app = await boot(false), { page } = app, m = page.mouse, k = page.keyboard;
    const cx = 760, cy = 450;

    // basic stroke
    await m.move(cx, cy); await m.down(); await m.move(cx + 80, cy + 20, { steps: 8 }); await m.up();
    await app.frames(3);
    let s = await state(app);
    check("stroke ends cleanly", !s.m1 && !s.m2 && s.queue === 0, JSON.stringify({ m1: s.m1, q: s.queue }));

    // keys
    for (const [key, field, desc] of [["f", "force", "F toggles force field"], ["a", "arrows", "A toggles arrows"], ["Tab", "borders", "Tab toggles borders"], ["h", "ui_hidden", "H hides the UI"]]) {
        const a = (await state(app))[field]; await k.press(key); const b = (await state(app))[field];
        await k.press(key); const c = (await state(app))[field];
        check(desc, a !== b && a === c, `${a} -> ${b} -> ${c}`);
    }
    // tool keys + repick cycling
    await k.press("w"); s = await state(app); check("W picks dye brush", s.mode === 1 && s.gmode === 0);
    await k.press("w"); s = await state(app); check("W again stays brush (no cycling)", s.mode === 1 && s.gmode === 0);
    await k.press("g"); s = await state(app); check("G: geyser mode", s.mode === 1 && s.gmode === 1);
    await k.press("g"); s = await state(app); check("G again: back to brush", s.gmode === 0);
    await k.press("g"); await k.press("w"); s = await state(app); check("W from geyser mode: brush", s.gmode === 0);
    await k.press("g"); await k.press("Escape"); s = await state(app); check("Esc: back to brush", s.gmode === 0);
    await S(app, () => ui_select_tool(MOUSE_MODE_WALL, 3)); await k.press("Escape"); s = await state(app);
    check("Esc on wall erase-lines: plain wall", s.mode === 4 && !s.wall_erase && !s.line);
    await S(app, () => ui_select_tool(MOUSE_MODE_WALL, 1)); await k.press("r"); s = await state(app);
    check("R on wall erase: plain wall", s.mode === 4 && !s.wall_erase);
    await k.press("g"); s = await state(app); check("G on wall: dye+force geysers", s.mode === 3 && s.gmode === 1);
    await k.down("Shift"); await k.press("G"); await k.up("Shift"); s = await state(app); check("Shift+G also toggles", s.gmode === 0);
    await k.press("q"); s = await state(app); check("Q: dye+force brush", !s.wall_erase && s.mode === 3 && s.gmode === 0);

    // keys ignored while typing in an inspector field
    const inp = page.locator("#inspector input[type=number]").first();
    if (await inp.count()) {
        await inp.focus(); const a = (await state(app)).arrows; await k.press("a");
        check("hotkeys ignored in inputs", (await state(app)).arrows === a);
        await inp.evaluate(e => e.blur());
    }

    // shift does not change the palette color
    await S(app, () => { stroke.palette_color = 4; });
    await k.down("Shift"); await k.up("Shift");
    check("Shift keeps palette color", (await state(app)).pal === 4);

    // dye geyser: click places, click opens editor, shift-click erases
    await k.press("w"); await k.press("g");
    await m.click(cx, cy); s = await state(app); check("dye geyser placed by click", s.n === 1 && !s.drag, `n=${s.n}`);
    let [gx, gy] = await geyser_px(app, 0);
    await m.click(gx, gy); s = await state(app); check("click on geyser opens editor", s.editing && s.n === 1);
    await k.press("Escape"); s = await state(app); check("Escape closes editor", !s.editing);
    await m.move(gx + 200, gy); await m.down(); await m.move(gx + 240, gy + 30, { steps: 5 }); await m.up();
    s = await state(app); check("dye-tool drag on empty: places one", s.n === 2, `n=${s.n}`);
    await k.down("Shift"); await m.click(gx, gy); await k.up("Shift");
    s = await state(app); check("shift-click erases a geyser", s.n === 1, `n=${s.n}`);
    check("no dye splat leaked while in geyser mode", s.queue === 0);

    // force geyser by drag
    await k.press("e"); await k.press("g");
    await m.move(cx - 200, cy); await m.down(); await m.move(cx - 120, cy - 40, { steps: 6 }); await m.up();
    s = await state(app);
    const g = await S(app, () => geysers.list.at(-1));
    check("force geyser placed by drag with strength", s.n === 2 && g.strength > 0 && g.force && !g.dye, JSON.stringify({ n: s.n, st: g.strength }));

    // right-click shorthand (force off) with the brush selected
    await k.press("q"); s = await state(app); check("Q to dye+force brush", s.mode === 3 && s.gmode === 0);
    await m.move(cx + 200, cy + 100); await m.down({ button: "right" }); await m.move(cx + 260, cy + 60, { steps: 5 }); await m.up({ button: "right" });
    s = await state(app); check("right-drag (force off) does nothing", s.n === 2 && !s.m1 && !s.m2 && !s.drag, JSON.stringify({ n: s.n, m1: s.m1, m2: s.m2 }));

    // hover then left-click with wall tool -> editor, not a wall
    await k.press("r");
    [gx, gy] = await geyser_px(app, 0);
    await m.move(gx + 30, gy + 30); await m.move(gx, gy); await sleep(150);
    check("no hover before delay", !(await state(app)).hover);
    await sleep(450);
    check("hover after delay", (await state(app)).hover);
    await m.click(gx, gy); s = await state(app);
    check("hovered click (wall tool) opens editor", s.editing && !s.m1, JSON.stringify({ ed: s.editing, m1: s.m1 }));
    await k.press("Escape");

    // hover + right-click deletes
    await m.move(gx + 30, gy + 30); await m.move(gx, gy); await sleep(600);
    const n0 = (await state(app)).n;
    await m.click(gx, gy, { button: "right" }); s = await state(app);
    check("hovered right-click deletes", s.n === n0 - 1 && !s.hover && !s.m2 && !s.m1, `n ${n0}->${s.n}`);
    const cursor = await page.evaluate(() => canvas_el.style.cursor);
    check("cursor back to none after delete", cursor === "none", cursor);

    // force on: right-drag pans, does not place geysers
    await k.press("q"); await k.press("f");
    const c0 = (await state(app)).center, n1 = (await state(app)).n;
    await m.move(cx, cy); await m.down({ button: "right" }); await m.move(cx + 100, cy + 50, { steps: 5 }); await m.up({ button: "right" });
    s = await state(app);
    check("force on: right-drag pans", s.center[0] !== c0[0] && !s.m2, JSON.stringify({ c0, c: s.center, n: s.n }));
    const sp0 = s.span; await m.move(cx, cy); await m.wheel(0, 300); await sleep(50);
    check("wheel zooms on canvas", (await state(app)).span !== sp0);
    const tb = await page.locator("#tools > button").first().boundingBox();
    const sp1 = (await state(app)).span; await m.move(tb.x + 10, tb.y + 10); await m.wheel(0, 300); await sleep(50);
    check("wheel over toolbar does not zoom", (await state(app)).span === sp1);
    await k.press("f");

    // toggles: accent color when on; borders button on == open borders
    const tcol = await page.evaluate(() => { const b = document.querySelector("#tools > button.toggle.active"); return b ? getComputedStyle(b).color : "none"; });
    check("active toggle is not erase-red", tcol !== "rgb(255, 123, 123)", tcol);
    const bord = await page.evaluate(() => [...document.querySelectorAll("#tools > button.toggle")].map(b => b.classList.contains("active")));
    await k.press("Tab"); const bord2 = await page.evaluate(() => [...document.querySelectorAll("#tools > button.toggle")].map(b => b.classList.contains("active")));
    const ob = (await state(app)).borders; await k.press("Tab");
    check("borders button lit iff closed", bord[1] === true && bord2[1] === false && ob === 1, JSON.stringify({ bord, bord2, ob }));

    // left + right together
    await m.move(cx, cy); await m.down(); await m.down({ button: "right" }); await m.up({ button: "right" }); await m.up();
    s = await state(app); check("left+right chord ends clean", !s.m1 && !s.m2 && !s.rclick && !s.drag, JSON.stringify(s));
    await m.move(cx, cy); await m.down({ button: "right" }); await m.down(); await m.up(); await m.up({ button: "right" });
    s = await state(app); check("right+left chord ends clean", !s.m1 && !s.m2 && !s.rclick && !s.drag, JSON.stringify(s));

    // release outside the page
    await m.move(cx, cy); await m.down(); await m.move(5000, cy, { steps: 3 });
    await page.dispatchEvent("html", "mouseleave");
    await m.up(); await m.move(cx, cy);
    s = await state(app); check("release outside page drops press", !s.m1, JSON.stringify({ m1: s.m1 }));
    await m.move(cx, cy); await m.down({ button: "right" }); await m.move(5000, cy, { steps: 3 }); await m.up({ button: "right" }); await m.move(cx, cy);
    s = await state(app); check("right release outside: clean", !s.m1 && !s.m2 && !s.drag, JSON.stringify({ m1: s.m1, m2: s.m2 }));

    // wall straight line with ctrl
    await k.press("r");
    await m.move(cx, cy - 150); await k.down("Control"); await m.down(); await m.move(cx + 200, cy - 150, { steps: 5 }); await m.up(); await k.up("Control");
    s = await state(app); check("ctrl wall line ends clean", !s.m1 && !s.ctrl, JSON.stringify({ m1: s.m1, ctrl: s.ctrl }));

    // backspace clears walls -> geysers too
    await k.press("Backspace"); await app.frames(3);
    s = await state(app); check("Backspace (clear) keeps state sane", !s.m1);

    // toolbar tooltip
    const b = page.locator("#tools > button").first(), bb = await b.boundingBox();
    await m.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(200);
    const fly = page.locator("#tools .flyout:not([hidden]) button").nth(1), fb = await fly.boundingBox();
    await m.move(fb.x + fb.width / 2, fb.y + fb.height / 2); await sleep(150);
    const tip = await page.evaluate(() => { const t = document.querySelector(".tb-tip"); const r = t.getBoundingClientRect(); return { vis: !t.hidden, w: r.width, right: r.right, bottom: r.bottom, iw: innerWidth, ih: innerHeight }; });
    check("toolbar tip visible & on screen", tip.vis && tip.w <= 260 && tip.right <= tip.iw && tip.bottom <= tip.ih, JSON.stringify(tip));
    await m.move(cx, cy); await sleep(400);
    check("tip hidden after leaving", await page.evaluate(() => document.querySelector(".tb-tip").hidden));
    check("flyout closed after leaving", await page.evaluate(() => !document.querySelector("#tools .flyout:not([hidden])")));

    // T opens glsl editor; keys inside it don't fire hotkeys
    await k.press("t"); s = await state(app); check("T opens field editor", s.glsl);
    const a0 = s.arrows; await page.keyboard.type("a");
    check("typing in editor doesn't toggle arrows", (await state(app)).arrows === a0);
    await k.press("Escape"); check("Escape closes field editor", !(await state(app)).glsl);

    // ---- newer features
    await k.press("q"); await m.move(cx, cy); await app.frames(2);
    s = await state(app); const r0 = [s.dye_r, s.push_r];
    await m.wheel(0, -100); await sleep(30); s = await state(app);
    check("wheel up (force off) grows both dye+force radii", s.dye_r > r0[0] && s.push_r > r0[1] && Math.abs(s.dye_r / r0[0] - s.push_r / r0[1]) < 1e-6, JSON.stringify({ r0, r: [s.dye_r, s.push_r] }));
    await m.wheel(0, 100); await sleep(30); s = await state(app);
    check("wheel down restores size", Math.abs(s.dye_r - r0[0]) < 1e-6, `${r0[0]} -> ${s.dye_r}`);
    for (let i = 0; i < 80; i++) await m.wheel(0, -100);
    s = await state(app); check("wheel clamps at max (200)", s.dye_r <= 200 && Number.isFinite(s.dye_r), String(s.dye_r));
    for (let i = 0; i < 120; i++) await m.wheel(0, 100);
    s = await state(app); check("wheel clamps at min (0.5)", s.dye_r >= 0.5 && Number.isFinite(s.dye_r), String(s.dye_r));
    await page.locator("#inspector .row").filter({ hasText: "radius" }).first().locator("label").dblclick().catch(() => {});
    await m.move(cx, cy); await k.press("e"); s = await state(app); const pr = s.push_r, dr = s.dye_r;
    await m.wheel(0, -100); s = await state(app); check("force tool: only force radius", s.push_r > pr && s.dye_r === dr);
    await k.press("r"); s = await state(app); const wr = s.wall_r;
    await m.wheel(0, -100); s = await state(app); check("wall tool: wall radius", s.wall_r > wr);
    await k.press("q"); await k.press("f"); s = await state(app); const sp = s.span, d0 = s.dye_r;
    await m.wheel(0, -100); s = await state(app); check("force on: wheel zooms, not brush", s.span !== sp && s.dye_r === d0);
    await k.press("f");

    // rings: dashed, finite, appear without movement
    const rings = () => page.evaluate(() => ["wall-ring", "force-ring"].map(id => { const e = document.getElementById(id); return { on: e.style.display !== "none", r: e.getAttribute("r"), dash: getComputedStyle(e).strokeDasharray }; }));
    await m.move(cx, cy); await app.frames(2);
    let rg = await rings(); check("dye+force: both rings shown, dashed, finite", rg.every(x => x.on && x.dash !== "none" && Number.isFinite(+x.r)), JSON.stringify(rg));
    const tb2 = await page.locator("#tools > button").nth(2).boundingBox();
    await m.move(tb2.x + 10, tb2.y + 10); await app.frames(2);
    check("over toolbar: rings hidden", (await rings()).every(x => !x.on));
    await k.press("h"); await app.frames(3);
    check("H with resting pointer: rings appear without move", (await rings()).some(x => x.on));
    await k.press("h"); await app.frames(3);
    check("UI back: rings hidden again", (await rings()).every(x => !x.on));

    // Space: no-op now
    await m.move(cx, cy); const before = await state(app); await k.press(" "); await app.frames(2);
    check("Space does nothing (no errors)", errs(app).length === 0);

    // Shift+Backspace: dye only, geysers & walls stay
    await S(app, () => ui_select_tool(MOUSE_MODE_DYE, 1)); await m.click(cx - 300, cy + 200); await k.press("Escape");
    const ng = (await state(app)).n;
    await k.down("Shift"); await k.press("Backspace"); await k.up("Shift"); await app.frames(2);
    s = await state(app); check("Shift+Backspace keeps geysers", s.n === ng && ng > 0, `n ${ng} -> ${s.n}`);
    check("Shift+Backspace doesn't erase walls flag/state", !s.m1);
    await k.press("Backspace"); await app.frames(2);
    check("Backspace clears geysers", (await state(app)).n === 0);

    // status bar
    const status = () => page.evaluate(() => ({ txt: document.getElementById("status").innerText, xy: getComputedStyle(document.getElementById("st-cursor")).display !== "none" }));
    let st0 = await status(); check("status: no fullscreen text, no xy (force off)", !/fullscreen/i.test(st0.txt) && !st0.xy, JSON.stringify(st0));
    await k.press("f"); st0 = await status(); check("status: xy with force on", st0.xy); await k.press("f");

    // borders: closed by default and lit
    const lit = await page.evaluate(() => [...document.querySelectorAll("#tools > button.toggle")].map(b => b.classList.contains("active")));
    check("closed-borders toggle lit by default", lit[1] === true && (await state(app)).borders === 0, JSON.stringify(lit));

    // fullscreen toggle follows real state
    const fsb = page.locator("#tools > button.toggle").nth(-2);   // the last one is ? (help)
    await fsb.click(); await sleep(300);
    const fs1 = await page.evaluate(() => [!!document.fullscreenElement, [...document.querySelectorAll("#tools > button.toggle")].at(-2).classList.contains("active")]);
    await page.evaluate(() => document.exitFullscreen()); await sleep(300);
    const fs2 = await page.evaluate(() => [!!document.fullscreenElement, [...document.querySelectorAll("#tools > button.toggle")].at(-2).classList.contains("active")]);
    check("fullscreen toggle on, then follows external exit", fs1[0] && fs1[1] && !fs2[0] && !fs2[1], JSON.stringify({ fs1, fs2 }));

    // hover geyser then wheel: brush resizes, geyser untouched, no stuck hover
    await S(app, () => ui_select_tool(MOUSE_MODE_DYE, 1)); await m.click(cx, cy); await k.press("Escape"); await k.press("w");
    const [hx, hy] = await geyser_px(app, 0); await m.move(hx + 30, hy); await m.move(hx, hy); await sleep(600);
    const hv = (await state(app)).hover; await m.wheel(0, -100); s = await state(app);
    check("hover + wheel: hover kept, geyser kept", hv && s.hover && s.n === 1, JSON.stringify({ hv, h: s.hover, n: s.n }));
    await k.press("g"); await app.frames(2); s = await state(app); check("entering geyser mode drops hover", !s.hover && await page.evaluate(() => canvas_el.style.cursor) === "none");
    await k.press("g");

    // tool pick while dragging a geyser / mid stroke
    await m.move(cx + 100, cy); await m.down(); await k.press("g"); await m.move(cx + 150, cy, { steps: 3 }); await m.up();
    s = await state(app); check("G mid-stroke ignored, stroke ends clean", s.gmode === 0 && !s.m1 && !s.drag, JSON.stringify({ g: s.gmode, m1: s.m1 }));
    await m.move(cx + 100, cy); await m.down(); await k.press("r"); await m.move(cx + 150, cy, { steps: 3 }); await m.up();
    s = await state(app); check("tool key mid-stroke: ends clean", !s.m1 && !s.drag, JSON.stringify({ m1: s.m1, mode: s.mode }));

    // NaN guard anywhere in brushes
    s = await state(app); check("no NaN brush values", [s.dye_r, s.push_r, s.wall_r].every(Number.isFinite));

    check("no page errors (desktop)", errs(app).length === 0, errs(app).slice(0, 3).join(" | "));
    await app.close();
}

// ---------------------------------------------------------------- touch
async function phone() {
    current = "touch"; console.log("\n== phone (touch)");
    const app = await boot(true), { page } = app;
    const vp = page.viewportSize(), cx = vp.width * 0.6, cy = vp.height * 0.5;

    await app.swipe([cx - 60, cy], [cx + 60, cy + 40]); await app.frames(3);
    let s = await state(app); check("touch stroke ends clean", !s.m1 && !s.m2 && s.queue === 0, JSON.stringify({ m1: s.m1, q: s.queue }));

    await app.tap(cx, cy); s = await state(app); check("tap ends clean", !s.m1);

    // two fingers with force off: nothing pending, no stroke
    await app.drag([[cx - 40, cy], [cx + 40, cy]], [[cx - 20, cy + 60], [cx + 60, cy + 60]]);
    s = await state(app); check("2-finger (force off) ends clean", !s.m1 && !s.m2 && !s.rclick && s.n === 0, JSON.stringify(s));

    // force on via toolbar tap
    const fbtn = page.locator("#tools > button.toggle").first();
    const [fx, fy] = await (async () => { const b = await fbtn.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; })();
    await app.tap(fx, fy); await sleep(100); s = await state(app); check("tap force toggle", s.force);
    const tipShown = await page.evaluate(() => !document.querySelector(".tb-tip").hidden);
    check("tap shows toolbar tip", tipShown);
    await sleep(2700);
    check("touch tip auto-hides", await page.evaluate(() => document.querySelector(".tb-tip").hidden));

    const c0 = (await state(app)).center;
    await app.drag([[cx - 40, cy], [cx + 40, cy]], [[cx - 40, cy + 80], [cx + 40, cy + 80]]);
    s = await state(app); check("2-finger pan moves center", s.center[1] !== c0[1] && !s.m1 && !s.m2, JSON.stringify({ c0, c: s.center }));
    const sp0 = s.span; await app.pinch([cx, cy], 80, 2.0); s = await state(app);
    check("pinch out zooms in (span smaller)", s.span < sp0, `${sp0} -> ${s.span}`);

    // stroke then add a 2nd finger: becomes pan, stroke released
    await app.touch("touchStart", [[cx, cy]]); await app.touch("touchMove", [[cx + 20, cy]]);
    await app.touch("touchStart", [[cx + 20, cy], [cx + 100, cy]]); await app.touch("touchMove", [[cx + 20, cy + 30], [cx + 100, cy + 30]]);
    s = await state(app); check("2nd finger turns stroke into pan", !s.m1 && s.m2, JSON.stringify({ m1: s.m1, m2: s.m2 }));
    await app.touch("touchMove", [[cx + 20, cy + 30]]);   // lift one finger: stays a pan, no new stroke
    s = await state(app); check("lifting one finger doesn't restart stroke", !s.m1, JSON.stringify({ m1: s.m1, m2: s.m2 }));
    await app.touch("touchEnd"); s = await state(app); check("all fingers up: clean", !s.m1 && !s.m2);

    // long-press force toggle opens field editor, doesn't toggle
    const f0 = (await state(app)).force; await app.longPress(fx, fy);
    s = await state(app); check("long-press force: editor, no toggle", s.glsl && s.force === f0, JSON.stringify({ glsl: s.glsl, force: s.force }));
    await S(app, () => ui_field_glsl.close());

    // long-press on the dye tool opens its flyout (the old swipe right is gone:
    // the toolbar is on the screen edge, where it means "back"); a tap picks
    const dye = page.locator("#tools > button").nth(1), db = await dye.boundingBox();
    const from = [db.x + db.width / 2, db.y + db.height / 2];
    await app.swipe(from, [from[0] + 60, from[1]], { steps: 6 });
    check("swipe right no longer opens a flyout", !(await page.evaluate(() => !!document.querySelector("#tools .flyout:not([hidden])"))));
    await app.longPress(from[0], from[1], 650);
    const flyOpen = await page.evaluate(() => !!document.querySelector("#tools .flyout:not([hidden])"));
    check("long-press opens the flyout", flyOpen);
    if (flyOpen) {
        const v = await page.locator("#tools .flyout:not([hidden]) button").nth(1).boundingBox();
        await app.tap(v.x + v.width / 2, v.y + v.height / 2);
        s = await state(app); check("tap variant picks dye geysers", s.mode === 1 && s.gmode === 1, JSON.stringify({ mode: s.mode, g: s.gmode }));
    } else {
        await S(app, () => ui_select_tool(MOUSE_MODE_DYE, 1));
    }
    const fb2 = await page.locator("#tools > button").nth(1).boundingBox();
    await page.evaluate(() => document.querySelectorAll("#tools .flyout").forEach(f => f.hidden = true));
    await app.tap(fb2.x + fb2.width / 2, fb2.y + fb2.height / 2); await sleep(100);
    s = await state(app);
    check("tap on current tool opens its flyout, keeps mode", await page.evaluate(() => !!document.querySelector("#tools .flyout:not([hidden])")) && s.gmode === 1, JSON.stringify({ g: s.gmode }));
    await page.evaluate(() => ui_toolbar.close_flyout());
    await S(app, () => { if (force.is_active) { ui_set_force_active(false); ui_force_btn.set(false, false); } });

    // place geyser by tap, tap it to edit
    await app.tap(cx, cy + 100); s = await state(app); check("tap places dye geyser", s.n === 1, `n=${s.n}`);
    const [gx, gy] = await geyser_px(app, 0);
    await app.tap(gx, gy); s = await state(app); check("tap geyser opens editor", s.editing && s.n === 1);
    const ed = await page.evaluate(() => { const r = document.getElementById("geyser-editor").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight }; });
    check("geyser editor fits phone screen", ed.l >= 0 && ed.r <= ed.w && ed.t >= 0 && ed.b <= ed.h, JSON.stringify(ed));

    // hover state must never arm on touch
    await app.longPress(gx, gy, 800); s = await state(app);
    check("no hover arming on touch", !s.hover);

    // clear menu (bin): opens on tap, three labelled actions, no key chips on touch
    const bin = await page.locator("#tools > button.menu-btn").boundingBox();
    await app.tap(bin.x + bin.width / 2, bin.y + bin.height / 2); await sleep(100);
    const items = await page.evaluate(() => [...document.querySelectorAll("#tools .flyout.menu:not([hidden]) button")].map(b => b.innerText.trim()));
    check("clear menu: 3 labelled items, no keys", items.join("|") === "Clear dye|Clear walls|Clear everything", items.join("|"));
    const ce = await page.locator("#tools .flyout.menu button").nth(2).boundingBox();
    await app.tap(ce.x + ce.width / 2, ce.y + ce.height / 2); await app.frames(3);
    s = await state(app); check("Clear everything clears geysers, toast offers undo", s.n === 0 && /Undo/.test(await page.evaluate(() => document.getElementById("toast").innerText)));
    const ub = await page.locator("#toast button").boundingBox();
    await app.tap(ub.x + ub.width / 2, ub.y + ub.height / 2); await app.frames(2);
    check("toast Undo brings geysers back", (await state(app)).n > 0);

    check("no page errors (touch)", errs(app).length === 0, errs(app).slice(0, 3).join(" | "));
    await app.close();
}

// ---------------------------------------------------------------- minified bundle
async function minified() {
    current = "minified"; console.log("\n== minified bundle (DOM-only checks)");
    const app = await open({ phone: false }), { page } = app, m = page.mouse, k = page.keyboard;
    const nanLogs = []; page.on("console", msg => { if (/NaN|undefined/.test(msg.text())) nanLogs.push(msg.text()); });
    await app.frames(20);
    const rings = () => page.evaluate(() => ["wall-ring", "force-ring"].map(id => document.getElementById(id).getAttribute("r")));
    await m.move(700, 450); await app.frames(2);
    for (const key of ["q", "w", "e", "r"]) {
        await k.press(key);
        for (let i = 0; i < 10; i++) await m.wheel(0, -3);
        for (let i = 0; i < 4; i++) await m.wheel(0, 120);
        await m.move(701, 450); await app.frames(2);
        const r = await rings(); check(`${key}: wheel keeps ring radii finite`, r.every(v => v === null || Number.isFinite(+v)), JSON.stringify(r));
    }
    // exercise most features through keys / mouse
    await k.press("q"); await m.move(600, 400); await m.down(); await m.move(800, 450, { steps: 6 }); await m.up();
    await k.press("g"); await m.move(500, 500); await m.down(); await m.move(560, 470, { steps: 4 }); await m.up();
    await app.frames(3);
    const dot = await page.evaluate(() => { const c = document.querySelector("#geysers .geyser-dot"); return c && [c.getAttribute("cx"), c.getAttribute("cy"), c.getAttribute("r")]; });
    check("geyser marker drawn with finite attrs", !!dot && dot.every(v => Number.isFinite(+v)), JSON.stringify(dot));
    await k.press("Escape"); await k.press("w");
    await m.move(530, 500); await m.move(500, 500); await page.waitForTimeout(600);
    await m.click(500, 500); const ed = await page.evaluate(() => !document.getElementById("geyser-editor").hidden);
    check("hover-click opens geyser editor (min)", ed);
    const sliders = await page.evaluate(() => [...document.querySelectorAll("#geyser-editor input[type=number]")].map(i => i.value));
    check("geyser editor values are numbers", sliders.length > 0 && sliders.every(v => v !== "" && Number.isFinite(+v)), JSON.stringify(sliders));
    await k.press("Escape");
    await m.move(530, 500); await m.move(500, 500); await page.waitForTimeout(600);
    await m.click(500, 500, { button: "right" }); await app.frames(3);
    check("hover right-click deletes (min)", await page.evaluate(() => !document.querySelector("#geysers .geyser-dot")));
    for (const key of ["a", "Tab", "f", "f", "a", "Tab"]) await k.press(key);
    await k.down("Shift"); await k.press("Backspace"); await k.up("Shift"); await k.press("Backspace");
    await k.press("t"); await page.waitForTimeout(200); await k.press("Escape");
    // inspector values: none should read NaN
    const bad = await page.evaluate(() => [...document.querySelectorAll("#inspector input[type=number]")].filter(i => i.value === "NaN" || i.value === "").map(i => i.closest(".row")?.querySelector("label")?.textContent));
    check("no NaN/empty inspector values", bad.length === 0, bad.join(", "));
    await app.frames(10);
    check("no page errors (min)", errs(app).length === 0, errs(app).slice(0, 3).join(" | "));
    check("no NaN console messages (min)", nanLogs.length === 0, nanLogs.slice(0, 2).join(" | "));
    await app.close();
}


// ---------------------------------------------------------------- scene features
const OUT = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "uitest-"));
const wallsSum = page => page.evaluate(() => { const b = new Uint8Array(N1 * N2 * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, obstacles_fbo); gl.readPixels(0, 0, N1, N2, gl.RGBA, gl.UNSIGNED_BYTE, b); gl.bindFramebuffer(gl.FRAMEBUFFER, null); let s = 0; for (let i = 0; i < b.length; i += 4) s += b[i]; return s; });
async function bootScene(raw = true, clear = true) {
  const app = await open({ phone: false, url: "about:blank" });
  if (raw) await app.page.route("**/bundle/index.min.js", r => r.fulfill({ contentType: "text/javascript", body: SRC }));
  await app.page.goto(INDEX);
  if (clear) { await app.page.evaluate(() => localStorage.clear()); await app.page.reload(); }
  await app.frames(15); return app;
}
async function scene_suite() {
current = "scene"; console.log("\n== scene features (help, undo, persistence)");
const toast = page => page.evaluate(() => { const t = document.getElementById("toast"); return t && !t.hidden ? t.innerText.replace(/\n/g, " ") : null; });

console.log("-- first visit hint + help");
let app = await bootScene(); let p = app.page, m = p.mouse, k = p.keyboard;
check("first-visit hint toast", /Press \? for all controls/.test(await toast(p) ?? ""), await toast(p));
await k.press("?"); check("? opens help", await p.evaluate(() => ui_help_open()));
check("help lit toolbar button", await p.evaluate(() => [...document.querySelectorAll("#tools > button.toggle")].at(-1).classList.contains("active")));
check("hint toast hidden by help", (await toast(p)) === null);
await k.press("Escape"); check("Esc closes help", !(await p.evaluate(() => ui_help_open())));
check("button unlit after Esc", !(await p.evaluate(() => [...document.querySelectorAll("#tools > button.toggle")].at(-1).classList.contains("active"))));
await p.locator("#tools > button.toggle").last().click(); check("toolbar ? opens", await p.evaluate(() => ui_help_open()));
await p.mouse.click(20, 20); check("backdrop click closes", !(await p.evaluate(() => ui_help_open())));
await p.reload(); await app.frames(10);
check("hint only on first visit", (await toast(p)) === null);
await k.press("?"); const hb = await p.evaluate(() => { const r = document.querySelector("#help .help-card").getBoundingClientRect(); return [r.width, r.height, innerHeight]; });
await p.screenshot({ path: path.join(OUT, "help-desktop.png") }); await k.press("?");
check("help card fits", hb[1] <= hb[2], JSON.stringify(hb));
await app.close();


console.log("-- #2 pan/zoom keep the scene");
app = await bootScene(); p = app.page; m = p.mouse; k = p.keyboard;
await k.press("r"); await m.move(500, 300); await m.down(); await m.move(900, 300, { steps: 8 }); await m.up();
await k.press("q"); await k.press("g"); await m.move(600, 550); await m.down(); await m.move(660, 520, { steps: 4 }); await m.up(); await k.press("Escape");
await app.frames(3);
const w0 = await wallsSum(p), n0 = await p.evaluate(() => geysers.list.length);
await k.press("f"); await app.frames(2);
await m.move(700, 450); await m.down({ button: "right" }); await m.move(760, 480, { steps: 5 }); await m.up({ button: "right" }); await m.wheel(0, -200); await app.frames(3);
check("pan + zoom keep walls", Math.abs(await wallsSum(p) - w0) < 1, `${w0} -> ${await wallsSum(p)}`);
check("pan + zoom keep geysers", (await p.evaluate(() => geysers.list.length)) === n0 && n0 === 1, `n ${n0}`);
await k.press("f");

console.log("-- #1 undo clears");
await k.press("Backspace"); await app.frames(2);
check("Backspace clears", (await wallsSum(p)) === 0 && (await p.evaluate(() => geysers.list.length)) === 0);
check("toast offers undo", /Cleared.*Undo/.test(await toast(p) ?? ""), await toast(p));
await k.down("Control"); await k.press("z"); await k.up("Control"); await app.frames(2);
check("Ctrl+Z restores walls", Math.abs(await wallsSum(p) - w0) < 1, `${await wallsSum(p)} vs ${w0}`);
check("Ctrl+Z restores geysers", (await p.evaluate(() => geysers.list.length)) === 1);
check("toast gone after undo", (await toast(p)) === null);
await k.down("Control"); await k.press("z"); await k.up("Control");
check("second Ctrl+Z: nothing to undo, no change", (await p.evaluate(() => geysers.list.length)) === 1);
await k.down("Control"); await k.press("Backspace"); await k.up("Control"); await app.frames(2);
check("Ctrl+Backspace clears walls", (await wallsSum(p)) === 0, await toast(p));
await p.locator("#toast button").click(); await app.frames(2);
check("Undo button restores walls", Math.abs(await wallsSum(p) - w0) < 1);
await k.down("Shift"); await k.press("Backspace"); await k.up("Shift"); await app.frames(2);
check("Shift+Backspace toast", /Dye cleared/.test(await toast(p) ?? ""), await toast(p));
await k.down("Control"); await k.press("z"); await k.up("Control"); await app.frames(1);
check("dye undo keeps walls/geysers", Math.abs(await wallsSum(p) - w0) < 1 && (await p.evaluate(() => geysers.list.length)) === 1);
await k.press("Backspace"); await sleep(6400);
check("undo expires after 6 s", (await toast(p)) === null && !(await p.evaluate(() => scene_undo())));
check("no errors (raw)", app.errors.length === 0, app.errors.slice(0, 2).join(" | "));
await app.close();

console.log("-- #4 persistence, real minified bundle");
app = await bootScene(false); p = app.page; m = p.mouse; k = p.keyboard;
await k.press("r"); await m.move(400, 250); await m.down(); await m.move(1000, 250, { steps: 10 }); await m.up();
await k.press("q"); await k.press("g");
for (const [x, y] of [[500, 600], [800, 650]]) { await m.move(x, y); await m.down(); await m.move(x + 60, y - 30, { steps: 4 }); await m.up(); }
await k.press("Escape"); await m.move(1200, 800); await sleep(1500);
const saved = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("fluid_scene_v1") ?? "null"); return s && { keys: Object.keys(s), g: s.geysers.length, gkeys: Object.keys(s.geysers[0] ?? {}), walls: (s.walls ?? "").length }; });
check("saved with readable keys", !!saved && saved.keys.includes("walls") && saved.gkeys.includes("strength") && saved.g === 2, JSON.stringify(saved));
const px = async () => { const b = await p.screenshot({ clip: { x: 700, y: 245, width: 1, height: 10 } }); return b.length; };
await app.frames(3);
const markers0 = await p.evaluate(() => document.querySelectorAll("#geysers .geyser-dot").length);
const wallShot0 = await p.screenshot({ clip: { x: 600, y: 240, width: 200, height: 20 } });
await p.reload(); await app.frames(20);
const markers1 = await p.evaluate(() => document.querySelectorAll("#geysers .geyser-dot").length);
check("geysers back after reload", markers0 === 2 && markers1 === 2, `${markers0} -> ${markers1}`);
const wallShot1 = await p.screenshot({ clip: { x: 600, y: 240, width: 200, height: 20 } });

const s1 = await p.evaluate(() => JSON.parse(localStorage.getItem("fluid_scene_v1") ?? "null")?.walls?.length ?? 0);
check("walls still saved after reload", s1 > 0 && Math.abs(s1 - saved.walls) / saved.walls < 0.2, `${saved.walls} -> ${s1}`);
await k.press("Backspace"); await sleep(1500);
check("clear removes the save", await p.evaluate(() => localStorage.getItem("fluid_scene_v1") === null));
check("no errors (min)", app.errors.length === 0, app.errors.slice(0, 2).join(" | "));
await app.close();

console.log("-- touch help");
const ph = await open({ phone: true }); await ph.frames(15);
check("touch hint text", /Tap \? in the toolbar/.test(await ph.page.evaluate(() => document.getElementById("toast")?.innerText ?? "")));
await ph.page.evaluate(() => [...document.querySelectorAll("#tools > button.toggle")].at(-1).scrollIntoView());
const hbx = await ph.page.locator("#tools > button.toggle").last().boundingBox();
await ph.tap(hbx.x + hbx.width / 2, hbx.y + hbx.height / 2); await sleep(200);
const txt = await ph.page.evaluate(() => document.getElementById("help")?.innerText ?? "");
check("touch help shows gestures, no keys", /long-press a geyser/i.test(txt) && !/Backspace|Ctrl|Shift|\bEsc\b/.test(txt), txt.slice(0, 80));
await ph.page.screenshot({ path: path.join(OUT, "help-phone.png") });
await ph.close();
}

await desktop().catch(e => check("desktop suite crashed", false, e.message.split("\n")[0]));
await phone().catch(e => check("touch suite crashed", false, e.message.split("\n")[0]));
await minified().catch(e => check("minified suite crashed", false, e.message.split("\n")[0]));
await scene_suite().catch(e => check("scene suite crashed", false, e.message.split("\n")[0]));
const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exitCode = bad.length ? 1 : 0;
