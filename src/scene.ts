/* The scene: walls and geysers (the dye and the flow are transient).
 *
 * Undo: a user clear (Backspace and its variants) first copies the walls, dye,
 * flow and geysers aside. A toast offers to bring them back for a few seconds
 * (also Ctrl+Z); after that the copy is freed.
 *
 * Persistence: walls and geysers are saved to localStorage a moment after they
 * change and when the page is hidden, and restored at load. The saved JSON
 * uses quoted keys: the minifier renames dotted properties, quoted ones it
 * leaves alone, so a save survives rebuilds. */

/** how long (ms) a clear can be undone. */
const UNDO_MS = 6000;

const undo = {
    snap: null as null | {
        n1: number, n2: number, m1: number, m2: number,
        walls: WebGLTexture, dye: WebGLTexture, vel: WebGLTexture,
        fbos: WebGLFramebuffer[], geysers: geyser_t[],
    },
    timer: 0,
};

function undo_free() {
    clearTimeout(undo.timer);
    const s = undo.snap;
    if (!s) return;
    for (const t of [s.walls, s.dye, s.vel]) gl.deleteTexture(t);
    for (const f of s.fbos) gl.deleteFramebuffer(f);
    undo.snap = null;
}

/** copies src into dst (same size), see sh_resample. Leaves BLEND off. */
function copy_texture(dst:WebGLFramebuffer, w:number, h:number, src:WebGLTexture) {
    gl.disable(gl.BLEND);
    gl.bindVertexArray(vao);
    resample_p.use_program();
    resample(dst, w, h, src, [1, 1], [1, 1, 1, 1], [0, 0, 0, 0]);
}

/** called right before a user clear (inside sim_step): keeps a copy and
 * offers to undo it. */
function scene_snapshot(what:string) {
    undo_free();
    const walls = create_texture(N1, N2, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null, gl.LINEAR, gl.CLAMP_TO_EDGE),
          dye = RGBA16F_texture(M1, M2),
          vel = RG16F_texture(N1, N2);
    const fbos = [frame_buffer(walls), frame_buffer(dye), frame_buffer(vel)];
    copy_texture(fbos[0], N1, N2, obstacles_tex);
    copy_texture(fbos[1], M1, M2, dye_tex[dye_read]);
    copy_texture(fbos[2], N1, N2, velocity_tex[velocity_read]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, N1, N2);
    gl.enable(gl.BLEND);                       // sim_step's state
    undo.snap = { n1: N1, n2: N2, m1: M1, m2: M2, walls, dye, vel, fbos, geysers: geysers.list.slice() };
    undo.timer = window.setTimeout(() => { undo_free(); ui_toast_hide(); }, UNDO_MS);
    ui_toast(what, { label: is_touch() ? "Undo" : "Undo  Ctrl+Z", run: () => scene_undo() }, UNDO_MS);
}

/** brings back what the last clear removed. False when there's nothing to
 * undo (expired, or the sim was rebuilt at another size since). */
function scene_undo() {
    const s = undo.snap;
    if (!s) return false;
    if (s.n1 !== N1 || s.n2 !== N2 || s.m1 !== M1 || s.m2 !== M2) { undo_free(); ui_toast_hide(); return false; }
    const blend = gl.isEnabled(gl.BLEND);
    copy_texture(obstacles_fbo, N1, N2, s.walls);
    copy_texture(dye_fbo[dye_read], M1, M2, s.dye);
    copy_texture(velocity_fbo[velocity_read], N1, N2, s.vel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (blend) gl.enable(gl.BLEND);
    obstacle_mask_dirty = true;
    geysers.list = s.geysers;
    geysers.version++;
    ui_geyser_editor_close();
    scene_changed();
    undo_free();
    ui_toast_hide();
    return true;
}

// ---------------------------------------------------------------- persistence

const SCENE_KEY = "fluid_scene_v1";
/** wait this long (ms) after the last change before saving. */
const SCENE_SAVE_DELAY = 1000;

/** save_seq: bumped by every save, so a slow async one can't overwrite a newer one. */
const scene = { dirty: false, changed_at: 0, geyser_version: -1, save_seq: 0 };

/** walls changed (geysers are watched through geysers.version). */
function scene_changed() {
    scene.dirty = true;
    scene.changed_at = performance.now();
}

/** every frame: saves a while after the last change, not mid-stroke. */
function scene_tick(now:number) {
    if (geysers.version !== scene.geyser_version) { scene.geyser_version = geysers.version; scene_changed(); }
    if (scene.dirty && !mouse.m1_down && now - scene.changed_at > SCENE_SAVE_DELAY) scene_save();
}

/** run-length encoding: [count 1..255, value] pairs. Walls are mostly long
 * runs of 0 and 255, so this shrinks them a lot. */
function rle_encode(src:Uint8Array) {
    const out:number[] = [];
    for (let i = 0; i < src.length;) {
        const v = src[i]; let n = 1;
        while (n < 255 && i + n < src.length && src[i + n] === v) n++;
        out.push(n, v);
        i += n;
    }
    return new Uint8Array(out);
}
function rle_decode(src:Uint8Array, length:number) {
    const out = new Uint8Array(length);
    let o = 0;
    for (let i = 0; i + 1 < src.length && o < length; i += 2) { out.fill(src[i + 1], o, Math.min(length, o + src[i])); o += src[i]; }
    return o === length ? out : null;
}
function to_base64(b:Uint8Array) {
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
}
function from_base64(s:string) {
    const bin = atob(s), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
}

/** saves the walls and geysers. The walls are read back from the GPU without
 * stalling (read_pixels_async), so the write lands a frame or two later.
 * sync: read and write now, for when the page is going away and later frames
 * may never come. */
function scene_save(sync = false) {
    scene.dirty = false;
    const seq = ++scene.save_seq;
    // everything but the walls is captured now, as it is at this moment
    const w = N1, h = N2, r = canvas_el.getBoundingClientRect();
    const geys = geysers.list.map(g => ({
        "uv": [g.uv[0], g.uv[1]], "angle": g.angle, "strength": g.strength, "color": g.color.slice(0, 3),
        "dye": g.dye, "force": g.force,
        "dye_radius": g.dye_radius, "dye_strength": g.dye_strength,
        "velocity_radius": g.velocity_radius, "velocity_strength": g.velocity_strength,
    }));
    const write = (rgba:Uint8Array) => {
        if (seq !== scene.save_seq) return;       // a newer save has started (or finished)
        const walls = new Uint8Array(w * h);
        let any = false;
        for (let i = 0; i < walls.length; i++) { walls[i] = rgba[i * 4]; any ||= walls[i] !== 0; }
        const data = {
            "v": 1, "w": w, "h": h, "cw": r.width, "ch": r.height,
            "walls": any ? to_base64(rle_encode(walls)) : null,
            "geysers": geys,
        };
        try {
            if (!any && geys.length === 0) localStorage.removeItem(SCENE_KEY);
            else localStorage.setItem(SCENE_KEY, JSON.stringify(data));
        } catch {}
    };
    // the walls: R8, read back as RGBA (always readable), red channel kept.
    // Where reads are falsified (readback_ok) only the geysers are saved
    const rgba = new Uint8Array(w * h * 4);
    if (!readback_ok) { write(rgba); return; }
    if (!sync) { read_pixels_async(obstacles_fbo, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba, write); return; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, obstacles_fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    write(rgba);
}

addEventListener("pagehide", () => { if (scene.dirty) scene_save(true); });
document.addEventListener("visibilitychange", () => { if (document.hidden && scene.dirty) scene_save(true); });

/** at load, after init_textures / init_ui: puts the saved walls and geysers
 * back, scaled about the screen center like a window resize (sh_resample). */
function scene_restore() {
    // in sync before any early return: with nothing saved, the first scene_tick
    // used to see version -1 as a change and save (and stall) a second after load
    scene.geyser_version = geysers.version;
    let d: any;
    try { d = JSON.parse(localStorage.getItem(SCENE_KEY) ?? "null"); } catch { return; }
    if (!d || d["v"] !== 1) return;
    const r = canvas_el.getBoundingClientRect();
    // screen pixels per uv unit, new over old
    const sx = r.width / (d["cw"] || r.width), sy = r.height / (d["ch"] || r.height);
    const to_now = (u:number, s:number) => (u - 0.5) / s + 0.5;

    if (typeof d["walls"] === "string" && d["w"] > 0 && d["h"] > 0) {
        const walls = rle_decode(from_base64(d["walls"]), d["w"] * d["h"]);
        if (walls) {
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            const tmp = create_texture(d["w"], d["h"], gl.R8, gl.RED, gl.UNSIGNED_BYTE, walls, gl.LINEAR, gl.CLAMP_TO_EDGE);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
            gl.disable(gl.BLEND);
            gl.bindVertexArray(vao);
            resample_p.use_program();
            resample(obstacles_fbo, N1, N2, tmp, [sx, sy], [1, 1, 1, 1], [0, 0, 0, 0]);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.deleteTexture(tmp);
            obstacle_mask_dirty = true;
        }
    }
    const num = (v:any, f:number) => typeof v === "number" && Number.isFinite(v) ? v : f;
    for (const s of Array.isArray(d["geysers"]) ? d["geysers"] : []) {
        const uv = s["uv"], c = s["color"];
        if (!Array.isArray(uv) || !Array.isArray(c)) continue;
        const u = to_now(num(uv[0], -1), sx), v = to_now(num(uv[1], -1), sy);
        if (u < 0 || u > 1 || v < 0 || v > 1 || geysers.list.length >= geysers.MAX) continue;
        const g: geyser_t = {
            uv: new Float32Array([u, v]), angle: num(s["angle"], 0), strength: num(s["strength"], 0),
            color: [num(c[0], 1), num(c[1], 1), num(c[2], 1)], rgba: new Float16Array(4),
            dye: !!s["dye"], force: !!s["force"],
            dye_radius: num(s["dye_radius"], splat.dye_radius), dye_strength: num(s["dye_strength"], splat.dye_strength),
            velocity_radius: num(s["velocity_radius"], splat.velocity_radius), velocity_strength: num(s["velocity_strength"], splat.velocity_strength),
        };
        geysers.list.push(g);
        geyser_changed(g);
    }
    scene.geyser_version = geysers.version;   // restoring is not a change
    scene.dirty = false;
}
