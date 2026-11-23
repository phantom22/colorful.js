const __dye_radius = 1.5;
const splat = {
    point: new Float32Array(2),
    dye_radius: texel_radius(__dye_radius),
    dye_strength: 1.0,
    velocity_radius: texel_radius(__dye_radius+3.0),
    velocity_strength: 0.4,
    force_scale: 0.3,
    prev: new Float32Array(2),
    next_is_start: true,
    queue: [] as { uv:Float32Array, rgba:Float16Array, start:boolean, no_dye:boolean, no_force:boolean }[]
};

const obstacle_splat = {    
    radius: texel(3),
    outline_width: texel(5.0),
    erase: 0,
    /** sticky erase, toggled by picking the wall tool again. */
    erase_mode: false,
    /** sticky straight-line mode, toggled by long-pressing the wall tool (what
     * holding ctrl does with a keyboard). */
    line_mode: false,
    next_is_start: true,
    queue: [] as { uv:Float32Array, erase:number, start:boolean }[],
    prev: new Float32Array(2)
};

/** brush sizes in sim texels, the unit the inspector edits. The splat values
 * are in screen-height units: dye / force are r of exp(-d²/r), whose 1/e
 * radius is √r; the wall radius is the contour distance. */
const brushes = { dye_radius: 0, force_radius: 0, wall_radius: 0, wall_outline: 0 };

/** one sim texel in screen-height units (splat distances are y-uv based). */
const sim_texel = () => 1 / N2;

/** brushes (texels) -> splat values. */
function brushes_apply() {
    const t = sim_texel();
    // the default texel count maps to the exact default size, so rounding
    // can't make a default brush drift across resolution changes
    splat.dye_radius = brushes.dye_radius === brush_default.dye_radius()
        ? BRUSH_DEFAULTS.dye : (brushes.dye_radius * t) ** 2;
    splat.velocity_radius = brushes.force_radius === brush_default.force_radius()
        ? BRUSH_DEFAULTS.force : (brushes.force_radius * t) ** 2;
    obstacle_splat.radius = brushes.wall_radius === brush_default.wall_radius()
        ? BRUSH_DEFAULTS.wall : brushes.wall_radius * t;
    obstacle_splat.outline_width = brushes.wall_outline === brush_default.wall_outline()
        ? BRUSH_DEFAULTS.outline : brushes.wall_outline * t;
}

/** startup splat values: the default brush sizes on screen. */
const BRUSH_DEFAULTS = { dye: 0, force: 0, wall: 0, outline: 0 };
function brushes_capture_defaults() {
    BRUSH_DEFAULTS.dye = splat.dye_radius;
    BRUSH_DEFAULTS.force = splat.velocity_radius;
    BRUSH_DEFAULTS.wall = obstacle_splat.radius;
    BRUSH_DEFAULTS.outline = obstacle_splat.outline_width;
}

/** a default brush size in texels of the current grid (so a reset restores
 * the default screen size at any resolution). */
const round_texels = (v:number) => Math.round(v * 10) / 10;
const brush_default = {
    dye_radius: () => round_texels(Math.sqrt(BRUSH_DEFAULTS.dye) / sim_texel()),
    force_radius: () => round_texels(Math.sqrt(BRUSH_DEFAULTS.force) / sim_texel()),
    wall_radius: () => round_texels(BRUSH_DEFAULTS.wall / sim_texel()),
    wall_outline: () => round_texels(BRUSH_DEFAULTS.outline / sim_texel()),
};

/** splat values -> brushes (texels), e.g. after the sim grid changed: the
 * brushes keep their screen size, their texel counts follow the grid. */
function brushes_read() {
    const t = sim_texel();
    brushes.dye_radius = round_texels(Math.sqrt(splat.dye_radius) / t);
    brushes.force_radius = round_texels(Math.sqrt(splat.velocity_radius) / t);
    brushes.wall_radius = round_texels(obstacle_splat.radius / t);
    brushes.wall_outline = round_texels(obstacle_splat.outline_width / t);
}

const stroke = {
    choosen_palette: palette_color_data,
    /** index of the color used from the current choosen palette of colors. */
    palette_color: 0,
};

function dispatch_splat(uv_pos:Float32Array, start:boolean, color_data?:color_data) {
    if (mouse.mode === MOUSE_MODE_WALL)
        set_obstacle_splat(uv_pos, start);
    else
        set_dye_splat(uv_pos, start, color_data);
}

function set_dye_splat(uv_pos:Float32Array, start:boolean, color_data?:color_data) {
    const fcolor = color_data !== undefined
        ? color_data.fcolor
        : stroke.choosen_palette[stroke.palette_color].fcolor;

        
    const log_color = new Float16Array(4);
    color_logarithm(log_color, fcolor);

    splat.queue.push({
        uv: Float32Array.from(uv_pos),
        rgba: log_color, 
        start: splat.next_is_start || start,
        no_dye: mouse.mode === MOUSE_MODE_FORCE,
        no_force: mouse.mode === MOUSE_MODE_DYE
    });

    splat.next_is_start = false;
}

/** wall strokes are straight lines: ctrl held, or the sticky line mode. */
function wall_line_mode() {
    return keyboard.ctrl_down || obstacle_splat.line_mode;
}

/** a straight wall line is being dragged out. */
function wall_line_pending() {
    return mouse.m1_down && mouse.mode === MOUSE_MODE_WALL && wall_line_mode();
}

/** wall brush erases: the sticky mode, inverted while shift is held. */
function wall_erasing() {
    return obstacle_splat.erase_mode !== keyboard.shift_down;
}

function set_obstacle_splat(uv_pos:Float32Array, start:boolean) {
    obstacle_splat.queue.push({
        uv: Float32Array.from(uv_pos),
        erase: wall_erasing() ? 1.0 : 0.0,
        start: obstacle_splat.next_is_start || start
    });

    obstacle_splat.next_is_start = false;
}

/** a splat weight below this is treated as zero when bounding the brush. */
const SPLAT_EPS = 1 / 1024;

/** distance (y-uv units) at which exp(-d²/r) * strength drops to `eps`. */
function gaussian_extent(r:number, strength:number, eps = SPLAT_EPS) {
    return Math.sqrt(r * Math.max(Math.log(strength / eps), 0));
}

/** scissors the next draws to the pixels within `e` (y-uv units, x is scaled
 * by ASPECT like in the shaders) of the segment a-b on a w*h target.
 * Returns false if nothing is covered. */
function scissor_segment(a:ArrayLike<number>, b:ArrayLike<number>, e:number, w:number, h:number) {
    const ex = e / ASPECT_NUM,
          x0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - ex) * w)),
          x1 = Math.min(w, Math.ceil((Math.max(a[0], b[0]) + ex) * w)),
          y0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - e) * h)),
          y1 = Math.min(h, Math.ceil((Math.max(a[1], b[1]) + e) * h));
    if (x1 <= x0 || y1 <= y0) return false;
    gl.scissor(x0, y0, x1 - x0, y1 - y0);
    return true;
}

/** splats are blended straight into the current texture (no ping-pong), so
 * each draw can be scissored to the brush footprint. */
function run_splats() {
    if (splat.queue.length === 0) return;

    splat_p.use_program();
    splat_p.uniforms["steps"].set(1);

    const _k1 = N1 * splat.force_scale / renderer.fixed_delta_time,
          _k2 = N2 * splat.force_scale / renderer.fixed_delta_time,
          vel_extent = gaussian_extent(splat.velocity_radius, splat.velocity_strength),
          dye_extent = gaussian_extent(splat.dye_radius, splat.dye_strength);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.enable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST);

    for (const s of splat.queue) {
        if (s.start) splat.prev.set(s.uv);

        splat_p.uniforms["point"].set(s.uv);
        splat_p.uniforms["prev"].set(splat.prev);

        const [u,v] = s.uv,
              du = u - splat.prev[0],
              dv = v - splat.prev[1];

        // velocity run, old + w * value. A zero-length segment adds nothing.
        if (!s.no_force && !s.start && (du !== 0 || dv !== 0) &&
            scissor_segment(s.uv, splat.prev, vel_extent, N1, N2)) {
            splat_p.uniforms["value"].set([du * _k1, dv * _k2, 0, 0]);
            splat_p.uniforms["brush_radius"].set(splat.velocity_radius);
            splat_p.uniforms["brush_strength"].set(splat.velocity_strength);
            splat_p.uniforms["additive"].set(1.0);

            gl.blendFunc(gl.ONE, gl.ONE);
            gl.viewport(0, 0, N1, N2);
            gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[velocity_read]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        // dye run, mix(old, value, w). rgb via src alpha = w, alpha via the constant
        if (!s.no_dye && scissor_segment(s.uv, splat.prev, dye_extent, M1, M2)) {
            splat_p.uniforms["value"].set(s.rgba);
            splat_p.uniforms["brush_radius"].set(splat.dye_radius);
            splat_p.uniforms["brush_strength"].set(splat.dye_strength);
            splat_p.uniforms["additive"].set(0.0);

            gl.blendColor(0, 0, 0, s.rgba[3]);
            gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.CONSTANT_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.viewport(0, 0, M1, M2);
            gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[dye_read]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        splat.prev.set(s.uv);
    }
    splat.queue.length = 0;

    gl.disable(gl.SCISSOR_TEST);
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/** A geyser is a constant source placed in geyser mode (pick the dye, force
 * or dye + force tool again). Force and dye + force: press where it goes,
 * drag toward where it should push, release; the longer the drag, the faster
 * its flow. Dye: a click places it, a drag from one moves it. Every sim step it
 * pulls the velocity around it toward its own and, for a dye + force geyser,
 * blends in its color, like a brush held there forever. Brush size and
 * strengths are the ones in use when it was placed. Click a geyser to edit
 * it; a drag that starts on one re-aims it. Stored in screen units, so it
 * doesn't depend on the sim resolution. */
type geyser_t = {
    /** center, screen fraction (0..1). */
    uv: Float32Array;
    /** push direction in degrees, 0 = right, counter-clockwise. */
    angle: number;
    /** flow speed, screen heights per second. */
    strength: number;
    /** dye color, 0..1 (dye + force geysers). */
    color: number[];
    /** color, log encoded for the splat (see geyser_changed). */
    rgba: Float16Array;
    /** emits dye (dye and dye + force geysers). */
    dye: boolean;
    /** pushes the flow (force and dye + force geysers). */
    force: boolean;
    dye_radius: number; dye_strength: number;
    velocity_radius: number; velocity_strength: number;
};

/** flow speed (screen heights/s) per screen height of drag. */
const GEYSER_GAIN = 4;
const GEYSER_MAX_STRENGTH = 10;
/** a press that moves less than this (px) is a click. */
const GEYSER_CLICK_PX = 6;
/** a click this close (px) to a geyser picks it. */
const GEYSER_PICK_PX = 12;

const geysers = {
    /** 0 off, 1 place / edit, 2 erase. Picking the force or dye + force tool
     * again steps through them. */
    mode: 0,
    list: [] as geyser_t[],
    /** each geyser is one or two splat draws per step. */
    MAX: 128,
    /** bumped on every change, for the screen markers. */
    version: 0,
    /** the press in progress: where it started, the geyser it started on. */
    drag: null as null | { from: Float32Array, target: geyser_t | null, moved: boolean, erase: boolean },
    /** geyser shown in the editor popup. */
    editing: null as geyser_t | null,
};

/** geyser mode with a tool that has it: presses place / edit / erase geysers. */
function geysers_active() {
    return geysers.mode > 0 && mouse.mode !== MOUSE_MODE_WALL;
}

/** erase mode, or shift held in geyser mode. */
function geysers_erasing() {
    return geysers_active() && (geysers.mode === 2 || keyboard.shift_down);
}

/** distance between two uv points in screen pixels. */
function uv_px(a:ArrayLike<number>, b:ArrayLike<number>) {
    return Math.hypot((a[0] - b[0]) * canvas_rect.width, (a[1] - b[1]) * canvas_rect.height);
}

/** the geyser under a point, if any. */
function geyser_at(uv:ArrayLike<number>) {
    let best: geyser_t | null = null, bd = GEYSER_PICK_PX;
    for (const g of geysers.list) { const d = uv_px(g.uv, uv); if (d <= bd) { bd = d; best = g; } }
    return best;
}

/** after an edit: re-encodes the color, redraws the markers. */
function geyser_changed(g:geyser_t) {
    color_logarithm(g.rgba, g.color);
    geysers.version++;
}

/** erasing reaches as far as the brush ring (dye ring if bigger). */
function geyser_erase_at(uv:ArrayLike<number>) {
    const r = Math.max(
        mouse.mode & MOUSE_MODE_FORCE ? gaussian_extent(splat.velocity_radius, splat.velocity_strength, RING_WEIGHT) : 0,
        mouse.mode & MOUSE_MODE_DYE ? gaussian_extent(splat.dye_radius, splat.dye_strength, RING_WEIGHT) : 0);
    const n = geysers.list.length;
    geysers.list = geysers.list.filter(g => Math.hypot((g.uv[0] - uv[0]) * ASPECT_NUM, g.uv[1] - uv[1]) > r);
    if (geysers.list.length === n) return;
    if (geysers.editing && !geysers.list.includes(geysers.editing)) ui_geyser_editor_close();
    geysers.version++;
}

function geyser_press(uv:Float32Array) {
    const erase = geysers_erasing();
    geysers.drag = { from: Float32Array.from(uv), target: erase ? null : geyser_at(uv), moved: false, erase };
    if (geysers.drag.target) geysers.drag.from.set(geysers.drag.target.uv);
    if (erase) geyser_erase_at(uv);
}

function geyser_move(uv:Float32Array) {
    const d = geysers.drag;
    if (!d) return;
    if (d.erase) { geyser_erase_at(uv); return; }
    if (!d.moved && uv_px(uv, d.from) > GEYSER_CLICK_PX) d.moved = true;
}

/** the drag from `from` to `uv` as (angle in degrees, strength). */
function geyser_aim(from:ArrayLike<number>, uv:ArrayLike<number>): [number, number] {
    const dx = (uv[0] - from[0]) * ASPECT_NUM, dy = uv[1] - from[1];   // screen heights
    return [Math.atan2(dy, dx) * 180 / Math.PI, Math.min(Math.hypot(dx, dy) * GEYSER_GAIN, GEYSER_MAX_STRENGTH)];
}

function geyser_release(uv:Float32Array) {
    const d = geysers.drag;
    geysers.drag = null;
    if (!d || d.erase) return;
    const dye_only = mouse.mode === MOUSE_MODE_DYE;
    if (!d.moved && d.target) { ui_geyser_editor_open(d.target); return; }   // a click on one: edit it
    if (!d.moved && (!dye_only || geysers.editing)) { ui_geyser_editor_close(); return; }   // on nothing: close
    if (d.target && dye_only) {           // dye tool: a drag from a geyser moves it
        d.target.uv.set(uv);
        geyser_changed(d.target);
        if (geysers.editing === d.target) ui_geyser_editor_refresh();
        return;
    }
    const [angle, strength] = dye_only ? [0, 0] : geyser_aim(d.from, uv);
    if (d.target) {                       // dragged from a geyser: re-aim it
        d.target.angle = angle;
        d.target.strength = strength;
        geyser_changed(d.target);
        if (geysers.editing === d.target) ui_geyser_editor_refresh();
        return;
    }
    if (geysers.list.length >= geysers.MAX) return;
    const fc = stroke.choosen_palette[stroke.palette_color].fcolor;
    const g: geyser_t = {
        uv: Float32Array.from(d.from), angle, strength,
        color: [fc[0], fc[1], fc[2]], rgba: new Float16Array(4),
        dye: (mouse.mode & MOUSE_MODE_DYE) !== 0,
        force: (mouse.mode & MOUSE_MODE_FORCE) !== 0,
        dye_radius: splat.dye_radius, dye_strength: splat.dye_strength,
        velocity_radius: splat.velocity_radius, velocity_strength: splat.velocity_strength,
    };
    geysers.list.push(g);
    geyser_changed(g);
}

/** every sim step: each geyser pulls the velocity toward its own (texels/s
 * of this grid: the cells are square, so a screen height is N2 texels on both
 * axes) and blends in its color, both as mix splats. The per-step blend is set
 * for 1/60 s and adjusted to the step length, so the target fps doesn't change
 * how strong a geyser is. */
function run_geysers() {
    if (geysers.list.length === 0) return;
    splat_p.use_program();
    splat_p.uniforms["additive"].set(0.0);
    splat_p.uniforms["steps"].set(renderer.fixed_dt_getter() * 60);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.enable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    for (const g of geysers.list) {
        splat_p.uniforms["point"].set(g.uv);
        splat_p.uniforms["prev"].set(g.uv);

        if (g.force && scissor_segment(g.uv, g.uv, gaussian_extent(g.velocity_radius, g.velocity_strength), N1, N2)) {
            const a = g.angle * Math.PI / 180, v = g.strength * N2;
            splat_p.uniforms["value"].set([Math.cos(a) * v, Math.sin(a) * v, 0, 0]);
            splat_p.uniforms["brush_radius"].set(g.velocity_radius);
            splat_p.uniforms["brush_strength"].set(g.velocity_strength);
            gl.viewport(0, 0, N1, N2);
            gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[velocity_read]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        if (g.dye && scissor_segment(g.uv, g.uv, gaussian_extent(g.dye_radius, g.dye_strength), M1, M2)) {
            splat_p.uniforms["value"].set(g.rgba);
            splat_p.uniforms["brush_radius"].set(g.dye_radius);
            splat_p.uniforms["brush_strength"].set(g.dye_strength);
            gl.blendColor(0, 0, 0, g.rgba[3]);
            gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.CONSTANT_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.viewport(0, 0, M1, M2);
            gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[dye_read]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
    }

    gl.disable(gl.SCISSOR_TEST);
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/** removes every geyser (clearing the walls clears them too). */
function clear_geysers() {
    if (geysers.list.length === 0) return;
    geysers.list = [];
    ui_geyser_editor_close();
    geysers.version++;
}

/** curl noise speed at the reference grid, texels/s. */
const CURL_NOISE_AMP = 50;

function fill_grid(color?:Float32Array, only_walls=false, add_noise=false) {
    const rgba16fv = new Float32Array([0.0,0.0,0.0,0.0]);
    texture_fill(obstacles_fbo, rgba16fv);
    obstacle_mask_dirty = true;
    clear_geysers();

    if (only_walls) return;

    if (color === undefined) {
        color = new Float32Array(4);
        color_logarithm(color, stroke.choosen_palette[stroke.palette_color].fcolor);
    }
    texture_fill(dye_fbo[dye_read], color);
    
    texture_fill(pressure_fbo[pressure_read], rgba16fv);
    texture_fill(curl_fbo, rgba16fv);
    texture_fill(divergence_fbo, rgba16fv);
    
    if (add_noise) {
        curl_velocity_fill_p.use_program();
        curl_velocity_fill_p.uniforms["seed"].set(Math.random());
        curl_velocity_fill_p.uniforms["amp"].set(CURL_NOISE_AMP * res_scale.sim);

        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[velocity_read]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    else {
        texture_fill(velocity_fbo[velocity_read], rgba16fv);
    }
}

function run_obstacle_splats() {
    if (obstacle_splat.queue.length === 0) return;

    obstacle_splat_p.use_program();
    obstacle_mask_dirty = true;
    
    gl.viewport(0, 0, N1, N2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, obstacles_fbo);

    gl.enable(gl.SCISSOR_TEST);
    for (const s of obstacle_splat.queue) {
        if (s.start) obstacle_splat.prev.set(s.uv);
        const r = s.erase ? obstacle_splat.radius + 0.045 : obstacle_splat.radius;

        if (scissor_segment(s.uv, obstacle_splat.prev, r + obstacle_splat.outline_width, N1, N2)) {
            obstacle_splat_p.uniforms["point"].set(s.uv);
            obstacle_splat_p.uniforms["erase"].set(s.erase);
            obstacle_splat_p.uniforms["brush_radius"].set(r);
            obstacle_splat_p.uniforms["prev"].set(obstacle_splat.prev);

            gl.blendEquation(s.erase ? gl.MIN : gl.MAX);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        obstacle_splat.prev.set(s.uv);
    }
    gl.disable(gl.SCISSOR_TEST);

    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);

    obstacle_splat.queue.length = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}