let velocity_tex: [WebGLTexture, WebGLTexture],
    velocity_fbo: [WebGLFramebuffer, WebGLFramebuffer],
    dye_tex: [WebGLTexture, WebGLTexture],
    dye_fbo: [WebGLFramebuffer, WebGLFramebuffer],
    pressure_tex: [WebGLTexture, WebGLTexture],
    pressure_fbo: [WebGLFramebuffer, WebGLFramebuffer],
    divergence_tex: WebGLTexture,
    divergence_fbo: WebGLFramebuffer,
    curl_tex: WebGLTexture,
    curl_fbo: WebGLFramebuffer,
    curl_smooth_tex: WebGLTexture,
    curl_smooth_fbo: WebGLFramebuffer,
    obstacles_tex: WebGLTexture,
    obstacles_fbo: WebGLFramebuffer,
    /** sim-res R8 scratch for the wall distance (see sh_wall_dist_h). */
    wall_dist_h_tex: WebGLTexture,
    wall_dist_h_fbo: WebGLFramebuffer,
    /** sim-res RGBA8: per-cell wall bit flags + wall_fade, see mask_glsl. */
    obstacle_mask_tex: WebGLTexture,
    obstacle_mask_fbo: WebGLFramebuffer,
    /** set whenever obstacles_tex changes; the mask is rebuilt before the sim. */
    obstacle_mask_dirty = true,
    obstacle_mask_borders = -1,
    /** the walls changed since the wall distance was last baked. */
    wall_dist_pending = true,

    velocity_read: number,
    pressure_read: number,
    dye_read: number;

    // reduction_sim_tex = [] as WebGLTexture[],
    // reduction_sim_fbo = [] as WebGLFramebuffer[],
    // reduction_sim_1x1_tex = [] as WebGLTexture[],
    // reduction_sim_1x1_fbo = [] as WebGLTexture[],
    // reduction_sim_read: number,

    // reduction_dye_tex = [] as WebGLTexture[],
    // reduction_dye_fbo = [] as WebGLFramebuffer[],
    // reduction_dye_1x1_tex = [] as WebGLTexture[],
    // reduction_dye_1x1_fbo = [] as WebGLTexture[],
    // reduction_dye_read: number;

/** sim / dye resolution in use: the inspector values, times the dynamic
 * resolution scale (pacing.scale, 1 when it's off). */
const eff_sim_resolution = () => Math.max(32, Math.round(fluid.sim_resolution * pacing.scale));
const eff_dye_resolution = () => Math.max(64, Math.round(fluid.dye_resolution * pacing.scale));

/** recomputes sim/dye dims and the texel constants from the window size. */
function update_sim_dims() {
    window_ar = canvas_el.height / canvas_el.width;
    const sr = eff_sim_resolution(), dr = eff_dye_resolution();
    fluid.sim_res = resolution(sr, window_ar);
    fluid.dye_res = resolution(dr, window_ar);
    res_scale.sim = sr / SIM_REF_RESOLUTION;
    res_scale.dye = dr / DYE_REF_RESOLUTION;
    TEXEL.set(fluid.sim_res.texel);
    DYE_TEXEL.set(fluid.dye_res.texel);
    [N1,N2] = fluid.sim_res.dims;
    [M1,M2] = fluid.dye_res.dims;
    ASPECT_NUM = N1/N2;
}

/** creates every sim texture/framebuffer at the current N1,N2 / M1,M2 and
 * clears the ones that hold no state worth carrying over. */
function alloc_textures() {
    const vel_0 = RG16F_texture(N1, N2),
          vel_1 = RG16F_texture(N1, N2),
          dye_0 = RGBA16F_texture(M1, M2),
          dye_1 = RGBA16F_texture(M1, M2),
          press_0 = R16F_texture(N1, N2),
          press_1 = R16F_texture(N1, N2);

    velocity_tex = [vel_0, vel_1];
    dye_tex = [dye_0, dye_1];
    pressure_tex = [press_0, press_1];
    divergence_tex = R16F_texture(N1, N2);
    curl_tex = create_texture(N1, N2, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    curl_smooth_tex = create_texture(N1, N2, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    obstacles_tex = create_texture(N1, N2, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    obstacle_mask_tex = create_texture(N1, N2, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.NEAREST, gl.CLAMP_TO_EDGE);
    wall_dist_h_tex = create_texture(N1, N2, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null, gl.NEAREST, gl.CLAMP_TO_EDGE);

    velocity_fbo = [frame_buffer(vel_0), frame_buffer(vel_1)];
    dye_fbo = [frame_buffer(dye_0), frame_buffer(dye_1)];
    pressure_fbo = [frame_buffer(press_0), frame_buffer(press_1)];
    divergence_fbo = frame_buffer(divergence_tex);
    curl_fbo = frame_buffer(curl_tex);
    curl_smooth_fbo = frame_buffer(curl_smooth_tex);
    obstacles_fbo = frame_buffer(obstacles_tex);
    obstacle_mask_fbo = frame_buffer(obstacle_mask_tex);
    wall_dist_h_fbo = frame_buffer(wall_dist_h_tex);
    obstacle_mask_dirty = true;

    const zero = new Float32Array([0.0,0.0,0.0,0.0]);
    texture_fill(divergence_fbo, zero);
    texture_fill(curl_fbo, zero);
    texture_fill(curl_smooth_fbo, zero);

    velocity_read = 0;
    pressure_read = 0;
    dye_read = 0;
    renderer.dye_prev_valid = false;

    alloc_multigrid();
    alloc_exposure();
}

function all_textures() {
    return [...velocity_tex, ...dye_tex, ...pressure_tex, divergence_tex,
        curl_tex, curl_smooth_tex, obstacles_tex, obstacle_mask_tex, wall_dist_h_tex, ...mg.textures, ...exposure.textures];
}

function all_fbos() {
    return [...velocity_fbo, ...dye_fbo, ...pressure_fbo, divergence_fbo,
        curl_fbo, curl_smooth_fbo, obstacles_fbo, obstacle_mask_fbo, wall_dist_h_fbo, ...mg.fbos, ...exposure.fbos];
}

/** re-bakes obstacle_mask_tex (and the multigrid face weights) if the walls or the border mode changed.
 * Expects the sim viewport (N1,N2) and blending off. */
function build_obstacle_mask() {
    if (!obstacle_mask_dirty && obstacle_mask_borders === fluid.open_borders) {
        if (wall_dist_pending) bake_wall_dist();
        return;
    }
    // the mask pass writes .b = 0 (no wall distance: every wall check runs),
    // the distance is baked once the walls stop changing (bake_wall_dist)
    obstacle_mask_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, obstacle_mask_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    build_multigrid_weights();
    obstacle_mask_dirty = false;
    obstacle_mask_borders = fluid.open_borders;
    wall_dist_pending = true;
}

/** distance to the nearest wall into obstacle_mask_tex .b, for the advect
 * passes' wall skip (see wall_skip_glsl). Runs on the first frame without wall
 * edits: while a wall is being drawn the distance stays 0, so the skip is off
 * and the bake (~4 ms at sim 1024) isn't paid on every frame of the stroke. */
function bake_wall_dist() {
    wall_dist_h_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, wall_dist_h_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    wall_dist_v_p.use_program();
    gl.bindTexture(gl.TEXTURE_2D, wall_dist_h_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, obstacle_mask_fbo);
    gl.colorMask(false, false, true, false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.colorMask(true, true, true, true);
    wall_dist_pending = false;
}

function init_textures() {
    update_sim_dims();
    alloc_textures();

    // reduction_textures(reduction_sim_tex, reduction_sim_fbo, N1, N2, 8);

    // const sim_1x1_0 = create_texture(1,1,gl.RG16F,gl.RG,gl.HALF_FLOAT,null,gl.NEAREST,gl.CLAMP_TO_EDGE);
    // const tex =
    // out_tex.push(tex);
    // out_fbo.push(frame_buffer(tex));

    // reduction_textures(reduction_dye_tex, reduction_dye_fbo, M1, M2, 8);

    // init_

    gl.viewport(0, 0, M1, M2);
    texture_fill(dye_fbo[0], fluid.bg);
    texture_fill(dye_fbo[1], fluid.bg);

    const zero = new Float32Array([0.0,0.0,0.0,0.0]);
    texture_fill(velocity_fbo[1], zero);
    texture_fill(pressure_fbo[0], zero);
    texture_fill(pressure_fbo[1], zero);
    texture_fill(obstacles_fbo, zero);

    gl.viewport(0, 0, N1, N2);
    gl.enable(gl.BLEND);
    curl_velocity_fill_p.use_program();
    curl_velocity_fill_p.uniforms["scale"].set(5.0);
    curl_velocity_fill_p.uniforms["amp"].set(CURL_NOISE_AMP * res_scale.sim);
    curl_velocity_fill_p.uniforms["div_mix"].set(0.1);
    curl_velocity_fill_p.uniforms["seed"].set(Math.random());

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // reduction_dye_read = 0;
    // reduction_sim_read = 0;
}

function resample(dst:WebGLFramebuffer, w:number, h:number, src:WebGLTexture,
                  uv_scale:ArrayLike<number>, value_scale:ArrayLike<number>, fill:ArrayLike<number>) {
    gl.viewport(0, 0, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    resample_p.uniforms["uv_scale"].set(uv_scale);
    resample_p.uniforms["value_scale"].set(value_scale);
    resample_p.uniforms["fill"].set(fill);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** inspector sim / dye resolution changed: rebuilds the textures at the new
 * sizes, carrying the state over like a resize (same canvas, so only the
 * texel density changes). No-op when the sizes come out the same. */
function apply_resolution() {
    if (!velocity_tex) return;   // before init_textures
    const ar = canvas_el.height / canvas_el.width,
          s = resolution(eff_sim_resolution(), ar).dims,
          d = resolution(eff_dye_resolution(), ar).dims;
    if (s[0] === N1 && s[1] === N2 && d[0] === M1 && d[1] === M2) return;
    const w = canvas_el.width, h = canvas_el.height;
    resize_simulation(w, h, w, h);
}

/** called once when a window resize settles. Reallocates the sim at the new
 * resolution and carries velocity, pressure, dye and walls over (anchored at
 * the screen center, see sh_resample). */
function resize_simulation(old_w:number, old_h:number, new_w:number, new_h:number) {
    const old = {
        N1, N2,
        velocity: velocity_tex[velocity_read],
        pressure: pressure_tex[pressure_read],
        dye: dye_tex[dye_read],
        obstacles: obstacles_tex,
        textures: all_textures(),
        fbos: all_fbos(),
    };

    update_sim_dims();
    alloc_textures();

    // screen pixels covered by one uv unit, new over old
    const uv_scale = [new_w / old_w, new_h / old_h];
    // velocity is in sim texels/s, so it scales with texels per screen pixel
    const sx = (N1 / new_w) / (old.N1 / old_w),
          sy = (N2 / new_h) / (old.N2 / old_h),
          sp = sx * sy,   // pressure ~ velocity * texel length
          zero = [0, 0, 0, 0],
          one = [1, 1, 1, 1];

    // pressure is NEAREST, sample it smoothly for the copy (texture is deleted after)
    gl.bindTexture(gl.TEXTURE_2D, old.pressure);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.disable(gl.BLEND);
    gl.bindVertexArray(vao);
    resample_p.use_program();
    resample(velocity_fbo[0], N1, N2, old.velocity,  uv_scale, [sx, sy, 1, 1], zero);
    resample(pressure_fbo[0], N1, N2, old.pressure,  uv_scale, [sp, 1, 1, 1],  zero);
    resample(obstacles_fbo,   N1, N2, old.obstacles, uv_scale, one,            zero);
    obstacle_mask_dirty = true;
    resample(dye_fbo[0],      M1, M2, old.dye,       uv_scale, one,            fluid.bg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    for (const t of old.textures) gl.deleteTexture(t);
    for (const f of old.fbos) gl.deleteFramebuffer(f);

    // geysers are in screen fractions: move them like the walls (sh_resample)
    if (uv_scale[0] !== 1 || uv_scale[1] !== 1) {
        for (const g of geysers.list)
            for (let i = 0; i < 2; i++) g.uv[i] = (g.uv[i] - 0.5) / uv_scale[i] + 0.5;
        geysers.list = geysers.list.filter(g => g.uv[0] >= 0 && g.uv[0] <= 1 && g.uv[1] >= 0 && g.uv[1] <= 1);
        geysers.version++;
    }

    obstacle_splat.next_is_start = splat.next_is_start = true;
    ui_update_bounds();
    ui_sync_brushes();
}
