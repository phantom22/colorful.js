const renderer = {
    /** when true, the grid vertex color lut table will get cleared with grid_bg
     * color (initial grid color). */
    color_clear_request: { noise:false, pending:false, only_walls:false, keep_scene:false, undoable:false },
    /** Shift+Backspace: refill only the dye with the background, the flow,
     * walls and geysers stay. */
    dye_clear_pending: false,
    /** current frame id. */
    frame: 0,
    /** used to calculate delta_time. */
    prev_timestamp: 0,
    delta_time: 0,
    /** seconds per sim step, 1 / the effective target fps (set by draw). */
    fixed_delta_time: 1 / 60,
    /** real time not yet simulated, see draw. */
    step_acc: 0,
    /** sim steps per second the user asks for, capped at the screen's refresh rate. */
    target_fps: 60,
    window_hidden: false,
    /** true from the first resize event until the sim is rebuilt; the loop idles. */
    resizing: false,
    dt_getter: () => renderer.delta_time,
    /** sim time per step. Slow motion keeps the full step and runs it less
     * often (see slowmo_rate), so only fast forward stretches it and pause
     * (0) zeroes it. */
    fixed_dt_getter: () => renderer.fixed_delta_time *
        (renderer.time_scale >= 1 || renderer.time_scale <= 0 ? renderer.time_scale : 1),
    time_scale: 1.0,
    /** sim seconds so far (the force field's `time`). */
    time: 0,
    /** real seconds between two sim steps, for brush speeds (see run_splats). */
    real_step: () => renderer.fixed_delta_time / slowmo_rate(),
    /** slow motion: how far (0..1) the picture is from the last step to the
     * next, see render_view. 0 otherwise. */
    interp: 0,
    /** dye_tex[1 - dye_read] holds the dye one step back (the slow motion
     * blend needs it); false after a realloc until the next step. */
    dye_prev_valid: false,
    /** keep_scene: walls and geysers stay (only the dye and the flow reset),
     * for the force field moving. undoable: a user clear, snapshot first. */
    request_color_clear(noise:boolean, only_walls:boolean, keep_scene = false, undoable = false) {
        const r = renderer.color_clear_request;
        r.pending = true;
        r.noise = noise;
        r.only_walls = only_walls;
        r.keep_scene = keep_scene;
        r.undoable = undoable;
    }
}

/** sim time per step over the 1/60 s the per-step settings are tuned at.
 * Anything applied once per step (dissipation, the pressure reach) is adjusted
 * by it, so a second of sim time does the same whatever the step length:
 * slow motion (time scale) and other target fps then run the same flow, only
 * slower or faster. */
const step_ratio = () => renderer.fixed_dt_getter() * 60;

/** a per-step factor tuned at 60 steps/s (e.g. velocity dissipation 0.999),
 * for the current step length. */
const per_step = (f:number) => f ** step_ratio();

/** sim steps per real step: the time scale below 1, else 1.
 *
 * Slow motion runs the same steps as real time, just fewer per second: at
 * 0.25x every 4th frame. Shrinking the step instead (as before) does not give
 * the same flow slowed down: the vorticity confinement grows swirls within a
 * few steps, so the result depends on the step length (measured: after one
 * second of sim time at 0.25x the flow had lost 30% of its speed and differed
 * from the 1x flow by 88%). Between steps the picture is carried along the
 * velocity (render_view), so the motion stays smooth. Pause (0) still steps
 * every frame with no time passing, so strokes keep painting. */
function slowmo_rate() {
    const ts = renderer.time_scale;
    return ts > 0 && ts < 1 ? ts : 1;
}

/** common refresh rates, a measured one snaps to the closest within 4%. */
const REFRESH_RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360];
/** dynamic resolution: scale levels applied to both sim and dye resolution. */
const DYN_LEVELS = [1, 0.85, 0.7, 0.6, 0.5, 0.4];

const pacing = {
    /** highest refresh rate seen (Hz), the target fps can't go above it. */
    refresh: 60,
    intervals: [] as number[],

    /** feeds one rAF interval; every 30 frames the median is snapped to a
     * common rate. The highest one seen wins: a busy GPU stretches frames,
     * which must not lower the cap. */
    sample_refresh(dt:number) {
        if (dt <= 0 || dt > 0.2) return;
        this.intervals.push(dt);
        if (this.intervals.length < 30) return;
        const s = this.intervals.sort((a, b) => a - b), hz = 1 / s[s.length >> 1];
        this.intervals = [];
        const snap = REFRESH_RATES.find(r => Math.abs(r - hz) / r < 0.04) ?? Math.round(hz);
        if (snap > this.refresh) this.refresh = snap;
    },

    /** the target fps actually used. */
    target_fps() { return Math.max(1, Math.min(renderer.target_fps, this.refresh)); },

    // dynamic resolution
    level: 0,
    /** current scale on the sim and dye resolution (1 when off). */
    get scale() { return fluid.dynamic_resolution ? DYN_LEVELS[this.level] : 1; },
    steps: [] as number[],          // timestamps of recent steps (ms)
    hold_until: 0,                  // no decision before this (ms), lets a change settle
    up_wait: 3000,                  // time at full rate before trying a level up (ms)
    last_up: -1e9,
    good_since: 0,

    fps_shown: -1e9,                // last status bar update (ms)

    stepped(t:number) {
        this.steps.push(t);
        while (this.steps.length && t - this.steps[0] > 1000) this.steps.shift();
        // the readout 4 times a second, not every step
        // in slow motion, per real-time step (it draws every frame regardless)
        if (t - this.fps_shown >= 250) { this.fps_shown = t; ui_status.fps(this.rate() / slowmo_rate(), this.frame_ms()); }
    },

    /** average time between steps over the last second (ms); in slow motion,
     * per drawn frame. 0 until two steps are in. */
    frame_ms() {
        const s = this.steps, n = s.length;
        return n < 2 ? 0 : (s[n - 1] - s[0]) / (n - 1) * slowmo_rate();
    },

    /** steps per second over the last second. */
    rate() { return this.steps.length; },

    /** dynamic resolution: drops a level when the sim falls below 90% of the
     * target for a second, tries a level up after up_wait at full rate. A level
     * up that has to be undone within 3 s doubles up_wait (up to a minute), so
     * it settles instead of flip-flopping. */
    update(t:number) {
        if (!fluid.dynamic_resolution) { if (this.level !== 0) this.set_level(0, t); return; }
        if (t < this.hold_until || this.steps.length === 0 || t - this.steps[0] < 900) return;
        const target = this.target_fps() * slowmo_rate(), rate = this.rate();
        if (rate < 0.9 * target) {
            this.good_since = t;
            if (this.level < DYN_LEVELS.length - 1) {
                if (t - this.last_up < 3000) this.up_wait = Math.min(this.up_wait * 2, 60000);
                this.set_level(this.level + 1, t);
            }
        } else if (rate >= 0.97 * target) {
            if (this.level > 0 && t - this.good_since > this.up_wait) {
                this.last_up = t;
                this.set_level(this.level - 1, t);
            }
        } else this.good_since = t;
    },

    set_level(l:number, t:number) {
        this.level = l;
        this.steps = [];
        this.good_since = t;
        this.hold_until = t + 1500;
        apply_resolution();
    },

    /** dynamic resolution switched on or off from the inspector. */
    toggled() {
        this.up_wait = 3000;
        if (!fluid.dynamic_resolution) this.set_level(0, performance.now());
    },
};

/** Idle: once nothing moves, the sim stops stepping and the canvas keeps its
 * last picture, so a still scene costs no GPU time (it used to run the whole
 * pipeline 60 times a second forever, the main battery drain on phones).
 * Every IDLE_CHECK_STEPS steps the velocity is reduced on the GPU and its
 * fastest cell read back without stalling; IDLE_CHECKS still results in a
 * row, with nothing else going on (sim_busy), and the sim idles. Any input,
 * a resize or a setting change wakes it (sim_wake). */
const IDLE_CHECK_STEPS = 30,
      IDLE_CHECKS = 2,
      /** fastest cell speed (sim texels/s) that counts as still: dye then
       * drifts by under a texel in 4 s. */
      IDLE_SPEED = 0.25;

const idle = {
    /** true: draw runs neither the sim nor the view. */
    on: false,
    /** steps since the last check. */
    steps: 0,
    /** still checks in a row. */
    still: 0,
    /** bumped by sim_wake: a check started before it is ignored. */
    gen: 0,
    pending: false,
    stats: new Float32Array(4),
};

/** true while something changes the picture without the fluid moving, or is
 * about to move it. */
function sim_busy() {
    return mouse.m1_down || mouse.m2_down || touch.pinch_dist > 0 ||
        splat.queue.length > 0 || obstacle_splat.queue.length > 0 ||
        geysers.list.length > 0 || force.is_active ||
        renderer.color_clear_request.pending || renderer.dye_clear_pending ||
        fluid.dye_dissipation !== 1 || (fluid.base_diffusion > 0 && fluid.max_diffusion > 0);
}

/** after a sim step: every IDLE_CHECK_STEPS steps, starts a still check. */
function idle_tick() {
    if (++idle.steps < IDLE_CHECK_STEPS || idle.pending) return;
    idle.steps = 0;
    if (sim_busy()) { idle.still = 0; return; }
    const last = reduce_field(velocity_tex[velocity_read], KIND_VECTOR), gen = idle.gen;
    idle.pending = true;
    read_pixels_async(last.fbo, 1, 1, gl.RGBA, gl.FLOAT, idle.stats, s => {
        if (gen !== idle.gen) return;            // woken meanwhile
        idle.pending = false;
        idle.still = s[2] < IDLE_SPEED ? idle.still + 1 : 0;
        if (idle.still >= IDLE_CHECKS && !sim_busy()) {
            idle.on = true;
            ui_status.idle();
        }
    });
}

/** resumes the sim and restarts the still count. Called on any input. */
function sim_wake() {
    idle.gen++;
    idle.still = 0;
    idle.steps = 0;
    idle.pending = false;
    if (!idle.on) return;
    idle.on = false;
    renderer.step_acc = 0;
    // the idle time is not a slow second: no dynamic resolution change for it
    pacing.steps = [];
    pacing.hold_until = performance.now() + 1500;
}

// wake on anything the user does. pointermove only while a button is held:
// hovering changes nothing in the sim, but a drag (an inspector scrub) can
for (const type of ["pointerdown", "keydown", "wheel", "input", "change", "touchstart"])
    addEventListener(type, sim_wake, { capture: true, passive: true });
addEventListener("pointermove", e => { if (e.buttons) sim_wake(); }, { capture: true, passive: true });

/** false when the diffusion rate is 0 everywhere: dye advect then skips it. */
function diffusion_active() {
    return fluid.max_diffusion > 0 &&
        (fluid.base_diffusion > 0 || fluid.curl_diffusion > 0 || fluid.velocity_diffusion > 0);
}

/** velocity -> divergence_tex. Normally merged into the pressure solve's
 * first sweep (sh_mg_smooth_div); used on its own when the solve is off. */
function run_divergence() {
    divergence_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacle_mask_tex);

    gl.viewport(0, 0, N1, N2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergence_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** one rAF callback. The sim advances in fixed steps of 1/target fps, at
 * most one per frame: a step runs once that much real time has built up, so
 * the speed is the same at any refresh rate (before, a 120 Hz screen ran it
 * twice as fast and twice as hard). Frames without a step draw nothing, the
 * canvas keeps the last picture. */
function draw(timestamp:number) {
    renderer.delta_time = (timestamp - renderer.prev_timestamp) * 0.001;
    renderer.prev_timestamp = timestamp;
    poll_readbacks();
    if (renderer.window_hidden || renderer.resizing) {
        renderer.step_acc = 0;
        requestAnimationFrame(draw);
        return;
    }

    pacing.sample_refresh(renderer.delta_time);

    // only while it can be seen: stowed (the default on phones) or with the
    // HUD hidden, the walk over every field is wasted (it shows again on open)
    if (++renderer.frame % 6 === 0 && ui_inspector.shown)
        ui_inspector.refresh();

    ui_update_mouse_overlay();

    const step = 1 / pacing.target_fps(), rate = slowmo_rate();
    renderer.fixed_delta_time = step;
    if (idle.on) {
        renderer.step_acc = 0;
    } else {
        renderer.step_acc = Math.min(renderer.step_acc + renderer.delta_time * rate, 2 * step);
        // a quarter step of slack: rAF timestamps jitter, and without it a 60 fps
        // target on a 60 Hz screen would skip a frame and double up the next.
        // Slow motion steps exactly on time, the interpolation shows the rest.
        if (renderer.step_acc >= (rate < 1 ? 1 : 0.75) * step) {
            renderer.step_acc = Math.min(renderer.step_acc - step, step);
            renderer.time += renderer.fixed_dt_getter();
            sim_step();
            renderer.interp = 0;
            render_view();
            pacing.stepped(timestamp);
            idle_tick();
        } else if (rate < 1) {
            // between slow motion steps: carry the picture along the flow by
            // the share of the next step that has passed
            renderer.interp = Math.max(0, Math.min(1, renderer.step_acc / step));
            render_view();
        }
        pacing.update(timestamp);
    }
    scene_tick(timestamp);

    requestAnimationFrame(draw);
}

/** splats, fluid sim and dye: one fixed step of renderer.fixed_delta_time. */
function sim_step() {
    gl.enable(gl.BLEND);

    gl.viewport(0, 0, N1, N2);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(vao);
    const cr = renderer.color_clear_request;
    if (cr.pending) {
        if (cr.undoable) scene_snapshot(cr.only_walls ? "Walls cleared" : "Cleared");
        fill_grid(fluid.bg, cr.only_walls, cr.noise, cr.keep_scene);
        cr.pending = cr.noise = cr.only_walls = cr.keep_scene = cr.undoable = false;
    }
    if (renderer.dye_clear_pending) {
        scene_snapshot("Dye cleared");
        texture_fill(dye_fbo[dye_read], fluid.bg);
        renderer.dye_clear_pending = false;
    }

    run_obstacle_splats();

    gl.disable(gl.BLEND);
    if (mouse.m1_down && mouse.mode & MOUSE_MODE_DYE && !geysers.drag)
        set_dye_splat(mouse.uv_pos, false);
    run_splats();
    run_geysers();

    //////////////////////////////////
    //          FLUID SIM           //
    //////////////////////////////////

    gl.viewport(0, 0, N1, N2);
    build_obstacle_mask();

    // wall distance for the advect passes' wall skip (see wall_skip_glsl)
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, obstacle_mask_tex);

    // 1. advect velocity by itself; an active force field is applied to the
    // result in the same pass (its shader includes the advection)
    (force.is_active ? forcefield_p : velocity_advect_p).use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1-velocity_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    velocity_read = 1 - velocity_read;

    // 2.1. smoothed curl in one pass (box-averaged, see sh_sim_curl_smooth),
    // for the vorticity confinement and the dye diffusion
    curl_smooth_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, curl_smooth_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2.2. raw curl, only the curl view shows it
    if (fluid.display_mode === DISPLAY_CURL) {
        curl_p.use_program();

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, obstacle_mask_tex);

        gl.bindFramebuffer(gl.FRAMEBUFFER, curl_fbo);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 2.3. calculate velocity from curls
    vorticity_confinement_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curl_smooth_tex);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacle_mask_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1-velocity_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    velocity_read = 1 - velocity_read;

    // 3-5. project: divergence + pressure solve (multigrid, warm started
    // from last frame). The divergence is computed by the solver's first sweep.
    solve_pressure();

    // 6. gradient subtract
    gradient_subtract_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacle_mask_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1-velocity_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    velocity_read = 1 - velocity_read;

    // if (force.is_active && force.pure_vector_field) {
    //     forcefield_p.use_program();

    //     gl.activeTexture(gl.TEXTURE0);
    //     gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    //     gl.activeTexture(gl.TEXTURE1);
    //     gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    //     gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1-velocity_read]);
    //     gl.drawArrays(gl.TRIANGLES, 0, 3);

    //     velocity_read = 1 - velocity_read;
    // }

    // 7. advect dye, with the vorticity-driven diffusion (step 8) merged in
    gl.viewport(0, 0, M1, M2);

    dye_advect_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[dye_read]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.activeTexture(gl.TEXTURE3);                  // diffusion, merged in
    gl.bindTexture(gl.TEXTURE_2D, curl_smooth_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1-dye_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    dye_read = 1 - dye_read;
    renderer.dye_prev_valid = true;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/** draws the current view to the canvas. */
function render_view() {
    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.BLEND);
    
    let display_tex: WebGLTexture, kind: fluid_display_kind_t,
        blur: fluid_diplay_blur_t|undefined,
        ref: number|undefined, thresh: number|undefined, k: number|undefined,
        palette = fluid.display_palette;
    gl.activeTexture(gl.TEXTURE0);
    switch (fluid.display_mode) {
        case DISPLAY_DYE:
            display_tex = dye_tex[dye_read];
            kind = KIND_DYE;
            break;
        case DISPLAY_VELOCITY:
            display_tex = velocity_tex[velocity_read];
            kind = KIND_VECTOR;
            blur = BLUR_CROSS;
            ref = fluid.display.velocity.ref * res_scale.sim;
            thresh = fluid.display.velocity.thresh;
            k = fluid.display.velocity.k;
            break;
        case DISPLAY_CURL:
            display_tex = curl_tex;
            kind = KIND_SCALAR;
            blur = BLUR_3x3_BINOMIAL;
            ref = fluid.display.curl.ref;
            thresh = fluid.display.curl.thresh;
            k = fluid.display.curl.k;
            break;
        case DISPLAY_PRESSURE:
            display_tex = pressure_tex[pressure_read];
            kind = KIND_SCALAR;
            blur = BLUR_CROSS;
            ref = fluid.display.pressure.ref * res_scale.sim ** 2;   // texel speed x texel length
            thresh = fluid.display.pressure.thresh;
            k = fluid.display.pressure.k;
            break;
        case DISPLAY_DIVERGENCE:
            display_tex = divergence_tex;
            kind = KIND_SCALAR;
            blur = BLUR_CROSS;
            ref = fluid.display.divergence.ref;
            thresh = fluid.display.divergence.thresh;
            k = fluid.display.divergence.k;
            palette = PALETTE_DIVERGING;
            break;
    }
    if (fluid.display.auto_exposure && kind !== KIND_DYE) {
        run_exposure(display_tex, kind);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.enable(gl.BLEND);
    } else {
        exposure.last_mode = -1;   // stale once paused, snap when it resumes
    }

    quad_p.use_program();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, exposure.tex[exposure.read]);
    gl.activeTexture(gl.TEXTURE3);                       // arrows read the raw velocity
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, display_tex);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    quad_p.uniforms["source_kind"].set(kind);
    quad_p.uniforms["blur_type"].set(blur);
    quad_p.uniforms["reference_value"].set(ref);
    quad_p.uniforms["value_rescale_threshold"].set(thresh);
    quad_p.uniforms["rescale_factor"].set(k);
    quad_p.uniforms["palette_type"].set(palette);
    // slow motion: the dye view blends the last two steps (one step behind, but
    // seamless at both ends); the others carry the current field forward
    const slow = slowmo_rate() < 1,
          blend_dye = slow && kind === KIND_DYE && renderer.dye_prev_valid;
    quad_p.uniforms["interp"].set(slow ? renderer.interp : 0);
    quad_p.uniforms["interp_dt"].set(renderer.fixed_dt_getter());
    quad_p.uniforms["interp_blend"].set(blend_dye ? 1 : 0);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[1 - dye_read]);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}