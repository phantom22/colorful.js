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

function fill_grid(color?:Float32Array, only_walls=false, add_noise=false) {
    const rgba16fv = new Float32Array([0.0,0.0,0.0,0.0]);
    texture_fill(obstacles_fbo, rgba16fv);
    obstacle_mask_dirty = true;

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