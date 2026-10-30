const renderer = {
    /** when true, the grid vertex color lut table will get cleared with grid_bg
     * color (initial grid color). */
    request_color_clear: { noise:false, pending:false },
    /** current frame id. */
    frame: 0,
    /** used to calculate delta_time. */
    prev_timestamp: 0,
    delta_time: 0,
    fixed_delta_time: 1 / 60,
    window_hidden: false,
    dt_getter: () => renderer.delta_time,
    fixed_dt_getter: () => renderer.fixed_delta_time * renderer.time_scale,
    checkboard_fill: false,
    time_scale: 1.0,
    time: 0
}

function draw(timestamp:number) {
    renderer.delta_time = (timestamp - renderer.prev_timestamp) * 0.001;
    renderer.prev_timestamp = timestamp;
    if (renderer.window_hidden) {
        requestAnimationFrame(draw);
        return;
    }

    renderer.time = timestamp*0.001;
    
    if (++renderer.frame % 6 === 0)
        ui_inspector.refresh();

    ui_status.fps(renderer.delta_time);

    gl.enable(gl.BLEND);

    gl.viewport(0, 0, N1, N2);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(vao);
    if (renderer.request_color_clear.pending) {
        fill_grid(fluid.bg, renderer.request_color_clear.noise);
        renderer.request_color_clear.pending = false;
        renderer.request_color_clear.noise = false;
    }

    run_obstacle_splats();

    gl.disable(gl.BLEND);
    if (mouse.m1_down &&
        (mouse.mode === MOUSE_MODE_DYE || mouse.mode === MOUSE_MODE_DYE_FORCE))
        set_dye_splat(mouse.uv_pos, false);
    run_splats();

    //////////////////////////////////
    //          FLUID SIM           //
    //////////////////////////////////

    gl.viewport(0, 0, N1, N2);

    if (force.is_active) {
        forcefield_p.use_program();

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1-velocity_read]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        velocity_read = 1 - velocity_read;
    }

    // 1. advect velocity by itself
    velocity_advect_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1-velocity_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    velocity_read = 1 - velocity_read;

    // 2.1. vorticity confinement
    curl_p.use_program();
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, curl_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2.2. blur curls
    blur_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, curl_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, curl_smooth_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2.3. calculate velocity from curls
    vorticity_confinement_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curl_smooth_tex);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1-velocity_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    velocity_read = 1 - velocity_read;

    // 3. project
    divergence_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, divergence_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 4. decay the pressure warm start
    rescale_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure_fbo[1-pressure_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    pressure_read = 1 - pressure_read;

    // 5. pressure jacobi iterations
    pressure_jacobi_p.use_program();
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, divergence_tex);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    for (let i=0; i<fluid.jacobi_iterations; ++i) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);

        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure_fbo[1-pressure_read]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        pressure_read = 1 - pressure_read;
    }

    // 6. gradient subtract
    gradient_subtract_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

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

    // 7. advect dye
    gl.viewport(0, 0, M1, M2);

    if (renderer.checkboard_fill) {        
        checkboard_fill_p.use_program();

        gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1-dye_read]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        dye_read = 1 - dye_read;
        renderer.checkboard_fill = false;
    }

    dye_advect_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[dye_read]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1-dye_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    dye_read = 1 - dye_read;

    // 8. two vorticity-driven diffusion passes
    diffusion_pass_p.use_program();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[dye_read]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curl_smooth_tex);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1-dye_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////

    quad_p.use_program();

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
            ref = fluid.display.velocity.ref;
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
            ref = fluid.display.pressure.ref;
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
    gl.bindTexture(gl.TEXTURE_2D, display_tex);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);

    quad_p.uniforms["source_kind"].set(kind);
    quad_p.uniforms["blur_type"].set(blur);
    quad_p.uniforms["reference_value"].set(ref);
    quad_p.uniforms["value_rescale_threshold"].set(thresh);
    quad_p.uniforms["rescale_factor"].set(k);
    quad_p.uniforms["palette_type"].set(palette);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    ///////////////
    // if (renderer.frame % 60 === 0) {
    //     const v = -Math.log(0.02);
    //     print_dye_stats([v,v,v]);
    // }


    requestAnimationFrame(draw);
}