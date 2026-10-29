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

function init_textures() {
    const vel_0 = RGBA16F_texture(N1, N2),
          vel_1 = RGBA16F_texture(N1, N2),
          dye_0 = RGBA16F_texture(M1, M2),
          dye_1 = RGBA16F_texture(M1, M2),
          press_0 = R16F_texture(N1, N2),
          press_1 = R16F_texture(N1, N2),
          vel_fbo_0 = frame_buffer(vel_0),
          vel_fbo_1 = frame_buffer(vel_1),
          dye_fbo_0 = frame_buffer(dye_0),
          dye_fbo_1 = frame_buffer(dye_1),
          press_fbo_0 = frame_buffer(press_0),
          press_fbo_1 = frame_buffer(press_1);

    velocity_tex = [vel_0, vel_1];
    dye_tex = [dye_0, dye_1];
    pressure_tex = [press_0, press_1];
    divergence_tex = R16F_texture(N1, N2);
    curl_tex = create_texture(N1, N2, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    curl_smooth_tex = create_texture(N1, N2, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    obstacles_tex = create_texture(N1, N2, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null, gl.LINEAR, gl.CLAMP_TO_EDGE);

    velocity_fbo = [vel_fbo_0, vel_fbo_1];
    dye_fbo = [dye_fbo_0, dye_fbo_1];
    pressure_fbo = [press_fbo_0, press_fbo_1];
    divergence_fbo = frame_buffer(divergence_tex);
    curl_fbo = frame_buffer(curl_tex);
    curl_smooth_fbo = frame_buffer(curl_smooth_tex);
    obstacles_fbo = frame_buffer(obstacles_tex);

    // reduction_textures(reduction_sim_tex, reduction_sim_fbo, N1, N2, 8);
    
    // const sim_1x1_0 = create_texture(1,1,gl.RG16F,gl.RG,gl.HALF_FLOAT,null,gl.NEAREST,gl.CLAMP_TO_EDGE);
    // const tex = 
    // out_tex.push(tex);
    // out_fbo.push(frame_buffer(tex));
    
    // reduction_textures(reduction_dye_tex, reduction_dye_fbo, M1, M2, 8);

    // init_

    gl.viewport(0, 0, M1, M2);
    texture_fill(dye_fbo_0, fluid.bg);
    texture_fill(dye_fbo_1, fluid.bg);
    
    const zero = new Float32Array([0.0,0.0,0.0,0.0]);
    texture_fill(vel_fbo_1, zero);
    texture_fill(press_fbo_0, zero);
    texture_fill(press_fbo_1, zero);
    texture_fill(divergence_fbo, zero);
    texture_fill(curl_fbo, zero);
    texture_fill(curl_smooth_fbo, zero);
    texture_fill(obstacles_fbo, zero);
    
    gl.viewport(0, 0, N1, N2);
    gl.enable(gl.BLEND);
    curl_velocity_fill_p.use_program();
    curl_velocity_fill_p.uniforms["scale"].set(5.0);
    curl_velocity_fill_p.uniforms["amp"].set(50.0);
    curl_velocity_fill_p.uniforms["div_mix"].set(0.1);
    curl_velocity_fill_p.uniforms["seed"].set(Math.random());

    gl.bindFramebuffer(gl.FRAMEBUFFER, vel_fbo_0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    velocity_read = 0;
    pressure_read = 0;
    dye_read = 0;
    // reduction_dye_read = 0;
    // reduction_sim_read = 0;
}