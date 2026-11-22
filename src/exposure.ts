/* Auto exposure for the non-dye views (velocity, curl, pressure, divergence).
 *
 * The displayed field is reduced on the GPU through a chain of textures, each
 * 4x smaller per side, ending in a 1x1 with the field's statistics. The adapt
 * pass eases its RMS over time into exposure_tex (1x1, ping-pong), which
 * quad_frag uses as the normalization factor in place of the manual "ref".
 * Nothing is read back to the CPU. */

const exposure = {
    /** reduction chain, the last level is 1x1. */
    levels: [] as { w: number, h: number, tex: WebGLTexture, fbo: WebGLFramebuffer }[],
    /** eased RMS in .x (max of the frame in .y), ping-pong. */
    tex: [] as WebGLTexture[],
    fbo: [] as WebGLFramebuffer[],
    read: 0,
    /** display mode of the last run; a change snaps instead of easing. */
    last_mode: -1,
    textures: [] as WebGLTexture[],
    fbos: [] as WebGLFramebuffer[],
};

let exposure_reduce_p: shader_program<[uniform<"tex_source", 7>, uniform<"tex_mask", 7>, uniform<"first", 4>, uniform<"source_kind", 4>]>,
    exposure_adapt_p: shader_program<[uniform<"tex_stats", 7>, uniform<"tex_prev", 7>, uniform<"blend", 5>]>;

function init_exposure_programs() {
    exposure_reduce_p = new shader_program("exposure_reduce", quad_vert, sh_exposure_reduce, [
        new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_mask", GL_TEXTURE, U_INIT, 1),
        new uniform("first", GL_INT),
        new uniform("source_kind", GL_INT),
    ]);
    exposure_adapt_p = new shader_program("exposure_adapt", quad_vert, sh_exposure_adapt, [
        new uniform("tex_stats", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_prev", GL_TEXTURE, U_INIT, 1),
        new uniform("blend", GL_FLOAT),
    ]);
}

/** builds the reduction chain for the current N1,N2. Called by alloc_textures. */
function alloc_exposure() {
    exposure.levels = [];
    exposure.textures = [];
    exposure.fbos = [];

    const rgba32f = (w:number, h:number) => {
        const t = create_texture(w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST, gl.CLAMP_TO_EDGE),
              f = frame_buffer(t);
        exposure.textures.push(t);
        exposure.fbos.push(f);
        return { t, f };
    };

    let w = N1, h = N2;
    do {
        w = Math.ceil(w / 4);
        h = Math.ceil(h / 4);
        const { t, f } = rgba32f(w, h);
        exposure.levels.push({ w, h, tex: t, fbo: f });
    } while (w > 1 || h > 1);

    const a = rgba32f(1, 1), b = rgba32f(1, 1);
    exposure.tex = [a.t, b.t];
    exposure.fbo = [a.f, b.f];
    exposure.read = 0;
    exposure.last_mode = -1;   // the new textures hold nothing, snap next time
}

/** updates exposure.tex[exposure.read] from the field `src` (sim resolution).
 * Leaves the sim viewport set and blending off. */
function run_exposure(src:WebGLTexture, kind:fluid_display_kind_t) {
    gl.disable(gl.BLEND);

    exposure_reduce_p.use_program();
    exposure_reduce_p.uniforms["source_kind"].set(kind);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacle_mask_tex);
    gl.activeTexture(gl.TEXTURE0);

    let input = src;
    for (let i = 0; i < exposure.levels.length; ++i) {
        const l = exposure.levels[i];
        exposure_reduce_p.uniforms["first"].set(i === 0 ? 1 : 0);
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.viewport(0, 0, l.w, l.h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, l.fbo);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        input = l.tex;
    }

    // ease toward the new value; snap after a view change or a realloc
    const snap = exposure.last_mode !== fluid.display_mode,
          tau = fluid.display.adapt_time,
          blend = snap || tau <= 0 ? 1 : 1 - Math.exp(-renderer.delta_time / tau);
    exposure.last_mode = fluid.display_mode;

    exposure_adapt_p.use_program();
    exposure_adapt_p.uniforms["blend"].set(blend);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, exposure.tex[exposure.read]);
    gl.viewport(0, 0, 1, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, exposure.fbo[1 - exposure.read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    exposure.read = 1 - exposure.read;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, N1, N2);
}
