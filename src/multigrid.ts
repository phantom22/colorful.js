/* Multigrid V-cycle pressure solver.
 *
 * Plain Jacobi only moves information one cell per pass, so large-scale
 * pressure barely converges. A V-cycle smooths a little on the sim grid, hands
 * the leftover error down a pyramid of half-size grids (where it is
 * short-range again), solves it there and adds the correction back. One cycle
 * costs about 9 sim-res Jacobi passes.
 *
 * Level 0 is the sim grid: its solution is pressure_tex and its rhs is
 * divergence_tex. Coarser levels own R32F textures. Each level has an RGBA8
 * face weight texture (see sh_mg_weights_*), rebuilt with the obstacle mask. */

interface mg_level {
    w: number;
    h: number;
    x_tex: WebGLTexture[];
    x_fbo: WebGLFramebuffer[];
    read: number;
    b_tex: WebGLTexture;
    b_fbo: WebGLFramebuffer | null;
    w_tex: WebGLTexture;
    w_fbo: WebGLFramebuffer;
    /** cell size in sim cells (1, 2, 4, ...). */
    size: number;
    /** see mg_edges. */
    active: Float32Array;
    ghost_lo: number;
    ghost_hi: Float32Array;
}

const mg = {
    levels: [] as mg_level[],
    /** textures/framebuffers owned by the solver (level 0 x and b are not). */
    textures: [] as WebGLTexture[],
    fbos: [] as WebGLFramebuffer[],
    omega: 0.8,
    /** Jacobi sweeps on the coarsest level (2x2 cells or smaller). */
    coarse_sweeps: 8,
    /** coarsening stops once both sides are at most this many cells. */
    min_size: 2,
};

type mg_edge_uniforms = [uniform<"extent", 8>, uniform<"ghost_lo", 5>, uniform<"ghost_hi", 8>];
let mg_smooth_p: shader_program<[uniform<"tex_x", 7>, uniform<"tex_b", 7>, uniform<"tex_w", 7>, uniform<"x_scale", 5>, uniform<"omega", 5>, ...mg_edge_uniforms]>,
    mg_restrict_p: shader_program<[uniform<"tex_x", 7>, uniform<"tex_b", 7>, uniform<"tex_w", 7>, ...mg_edge_uniforms]>,
    mg_prolong_p: shader_program<[uniform<"tex_x", 7>, uniform<"tex_e", 7>, uniform<"tex_w", 7>, uniform<"tex_cw", 7>, uniform<"extent_f", 8>, ...mg_edge_uniforms]>,
    mg_weights_fine_p: shader_program<[uniform<"tex_mask", 7>]>,
    mg_weights_coarse_p: shader_program<[uniform<"tex_w", 7>]>;

const mg_edge_uniforms = () => [
    new uniform("extent", GL_VEC2),
    new uniform("ghost_lo", GL_FLOAT),
    new uniform("ghost_hi", GL_VEC2),
] as [uniform<"extent", 8>, uniform<"ghost_lo", 5>, uniform<"ghost_hi", 8>];

function init_multigrid_programs() {
    mg_smooth_p = new shader_program("mg_smooth", quad_vert, sh_mg_smooth, [
        new uniform("tex_x", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_b", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_w", GL_TEXTURE, U_INIT, 2),
        new uniform("x_scale", GL_FLOAT),
        new uniform("omega", GL_FLOAT, U_UPDATE, () => mg.omega),
        ...mg_edge_uniforms(),
    ]);
    mg_restrict_p = new shader_program("mg_restrict", quad_vert, sh_mg_restrict, [
        new uniform("tex_x", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_b", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_w", GL_TEXTURE, U_INIT, 2),
        ...mg_edge_uniforms(),
    ]);
    mg_prolong_p = new shader_program("mg_prolong", quad_vert, sh_mg_prolong, [
        new uniform("tex_x", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_e", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_w", GL_TEXTURE, U_INIT, 2),
        new uniform("tex_cw", GL_TEXTURE, U_INIT, 3),
        new uniform("extent_f", GL_VEC2),
        ...mg_edge_uniforms(),
    ]);
    mg_weights_fine_p = new shader_program("mg_weights_fine", quad_vert, sh_mg_weights_fine, [
        new uniform("tex_mask", GL_TEXTURE, U_INIT, 0),
    ]);
    mg_weights_coarse_p = new shader_program("mg_weights_coarse", quad_vert, sh_mg_weights_coarse, [
        new uniform("tex_w", GL_TEXTURE, U_INIT, 0),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);
}

/** smallest distance (in a level's cells) from the last cell centre to the
 * open-border zero point before that cell is held at 0 instead. */
const MG_MIN_EDGE_GAP = 0.25;

/** open borders put pressure 0 half a sim cell past each edge. On a level
 * with cells `size` sim cells wide the ghost factor g (ghost = g * x) puts the
 * zero at that same spot: g = 1 - 1/t, t = distance from the last cell centre
 * to the zero point in cells. The left/bottom edges line up on every level;
 * the right/top ones overhang when sizes are rounded up, and a last column or
 * row that sits (nearly) past the zero point is held at 0 instead. Closed
 * borders have face weight 0 there, so none of this applies. */
function mg_edges(l:mg_level) {
    const open = fluid.open_borders === 1,
          s = l.size;
    const side = (n_sim:number, n:number, axis:number) => {
        let active = n, g = 0;
        if (open) {
            const t = (n_sim + 0.5) / s - n + 0.5;
            if (t < MG_MIN_EDGE_GAP) active = n - 1;
            else g = 1 - 1 / t;
        }
        l.active[axis] = active;
        l.ghost_hi[axis] = g;
    };
    side(N1, l.w, 0);
    side(N2, l.h, 1);
    l.ghost_lo = open ? -(s - 1) / (s + 1) : 0;
}

function mg_set_edges(p:{uniforms:{extent:uniform<"extent",8>, ghost_lo:uniform<"ghost_lo",5>, ghost_hi:uniform<"ghost_hi",8>}}, l:mg_level) {
    p.uniforms["extent"].set(l.active);
    p.uniforms["ghost_lo"].set(l.ghost_lo);
    p.uniforms["ghost_hi"].set(l.ghost_hi);
}

/** builds the level pyramid at the current N1,N2. Called by alloc_textures
 * after the pressure and divergence textures exist. */
function alloc_multigrid() {
    mg.levels = [];
    mg.textures = [];
    mg.fbos = [];

    const own_tex = (t:WebGLTexture) => (mg.textures.push(t), t);
    const own_fbo = (t:WebGLTexture) => { const f = frame_buffer(t); mg.fbos.push(f); return f; };
    const weights = (w:number, h:number) => own_tex(create_texture(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.NEAREST, gl.CLAMP_TO_EDGE));
    const r32f = (w:number, h:number) => own_tex(create_texture(w, h, gl.R32F, gl.RED, gl.FLOAT, null, gl.NEAREST, gl.CLAMP_TO_EDGE));

    const w0 = weights(N1, N2);
    const edges = () => ({ active: new Float32Array(2), ghost_lo: 0, ghost_hi: new Float32Array(2) });
    mg.levels.push({
        w: N1, h: N2, size: 1, ...edges(),
        x_tex: pressure_tex, x_fbo: pressure_fbo, read: pressure_read,
        b_tex: divergence_tex, b_fbo: null,
        w_tex: w0, w_fbo: own_fbo(w0),
    });

    let w = N1, h = N2, size = 1;
    while (Math.max(w, h) > mg.min_size) {
        w = Math.ceil(w / 2);
        h = Math.ceil(h / 2);
        size *= 2;
        const x0 = r32f(w, h), x1 = r32f(w, h), b = r32f(w, h), wt = weights(w, h);
        mg.levels.push({
            w, h, size, ...edges(),
            x_tex: [x0, x1], x_fbo: [own_fbo(x0), own_fbo(x1)], read: 0,
            b_tex: b, b_fbo: own_fbo(b),
            w_tex: wt, w_fbo: own_fbo(wt),
        });
    }
}

/** re-bakes every level's face weights from obstacle_mask_tex. Called by
 * build_obstacle_mask; leaves the sim viewport set. */
function build_multigrid_weights() {
    const L = mg.levels;

    mg_weights_fine_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, obstacle_mask_tex);
    gl.viewport(0, 0, L[0].w, L[0].h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, L[0].w_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    mg_weights_coarse_p.use_program();
    for (let i = 1; i < L.length; ++i) {
        gl.bindTexture(gl.TEXTURE_2D, L[i-1].w_tex);
        gl.viewport(0, 0, L[i].w, L[i].h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, L[i].w_fbo);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.viewport(0, 0, N1, N2);
}

function mg_bind(unit:number, tex:WebGLTexture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
}

/** one damped Jacobi sweep on level l; x_scale multiplies the old solution. */
function mg_smooth(l:mg_level, x_scale:number) {
    mg_smooth_p.use_program();
    mg_smooth_p.uniforms["x_scale"].set(x_scale);
    mg_set_edges(mg_smooth_p, l);
    mg_bind(0, l.x_tex[l.read]);
    mg_bind(1, l.b_tex);
    mg_bind(2, l.w_tex);
    gl.viewport(0, 0, l.w, l.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, l.x_fbo[1 - l.read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    l.read = 1 - l.read;
}

/** coarse rhs = fine residual summed over each 2x2 block. */
function mg_restrict(f:mg_level, c:mg_level) {
    mg_restrict_p.use_program();
    mg_set_edges(mg_restrict_p, f);
    mg_bind(0, f.x_tex[f.read]);
    mg_bind(1, f.b_tex);
    mg_bind(2, f.w_tex);
    gl.viewport(0, 0, c.w, c.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, c.b_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** fine x += interpolated coarse correction. */
function mg_prolong(f:mg_level, c:mg_level) {
    mg_prolong_p.use_program();
    mg_set_edges(mg_prolong_p, c);
    mg_prolong_p.uniforms["extent_f"].set(f.active);
    mg_bind(0, f.x_tex[f.read]);
    mg_bind(1, c.x_tex[c.read]);
    mg_bind(2, f.w_tex);
    mg_bind(3, c.w_tex);
    gl.viewport(0, 0, f.w, f.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.x_fbo[1 - f.read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    f.read = 1 - f.read;
}

/** x_scale applies to the first sweep only: 0 on coarse levels (each cycle
 * solves for a fresh correction), jacobi_scale for the warm start. */
function mg_vcycle(i:number, x_scale:number) {
    const L = mg.levels, l = L[i];
    if (i === L.length - 1) {
        for (let k = 0; k < mg.coarse_sweeps; ++k)
            mg_smooth(l, k === 0 ? x_scale : 1);
        return;
    }
    const sweeps = Math.max(1, fluid.pressure_smoothing);
    for (let k = 0; k < sweeps; ++k)
        mg_smooth(l, k === 0 ? x_scale : 1);
    mg_restrict(l, L[i+1]);
    mg_vcycle(i + 1, 0);
    mg_prolong(l, L[i+1]);
    for (let k = 0; k < sweeps; ++k)
        mg_smooth(l, 1);
}

/** solves for pressure_tex[pressure_read] from divergence_tex. Leaves the
 * sim viewport set and texture unit 3 bound to a solver texture. */
function solve_pressure() {
    const l0 = mg.levels[0];
    // level 0 aliases the pressure ping-pong; resync after a realloc/resize
    l0.x_tex = pressure_tex;
    l0.x_fbo = pressure_fbo;
    l0.b_tex = divergence_tex;
    l0.read = pressure_read;

    if (fluid.pressure_cycles <= 0) {
        texture_fill(pressure_fbo[pressure_read], [0, 0, 0, 0]);
        return;
    }

    for (const l of mg.levels) mg_edges(l);

    for (let c = 0; c < fluid.pressure_cycles; ++c)
        mg_vcycle(0, c === 0 ? fluid.jacobi_scale : 1);

    pressure_read = l0.read;
    gl.viewport(0, 0, N1, N2);
}
