    /** buffer used to read from the vertex mask texture. */
let pixel_data = new Uint32Array(1),
    /** this is set to true on window.onresize; forces to recalculate the vertex 
     * mask texture during the draw pass. */
    force_render_mask = true,
    /** this is set to true any time that grid.texture or grid.texture_u32view 
     * get modified; forces to update the shader data. */
    texture_is_dirty = false,
    /** when true, considering both mouse and keyboard state, an action is
     * performed (i.e. a verte is clicked or hovered, the grid is filled or
     * cleared); can be set to true only once per frame. */
    request_sample = false,
    /** when true, the grid vertex color lut table will get cleared with grid_bg
     * color (initial grid color). */
    request_clear = false,
    /** frame count. */
    frame = 0;

function draw() {
    ++frame;

    if (request_clear) {
        const clear_color = packUint8(grid_bg);
        for (let i=0; i<grid.adj_graph.length; ++i)
            grid.texture_u32view[i] = clear_color;

        if (queued_wave_count > 0) {
            prevent_waves_last_id = wave_id + queued_wave_count;
            wave_id = prevent_waves_last_id + 1;
        }
        request_clear = false;
        texture_is_dirty = true;
    }

    if (force_render_mask || request_sample) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);

        if (force_render_mask) {
            gl.viewport(0, 0, width, height);

            gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));

            mask_p.useProgram();
            gl.uniformMatrix4fv(mask_p.uniforms["u_proj"], false, proj_mat);

            gl.bindVertexArray(mask_vao);
            gl.drawArrays(gl.TRIANGLES, 0, vertex_count);

            force_render_mask = false;
        }

        if (request_sample && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
            gl.readPixels(
                mouse_x, mouse_y, 1, 1,
                gl.RED_INTEGER, gl.UNSIGNED_INT, pixel_data
            );

            process_stroke(pixel_data[0]);
            request_sample = false;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    p.useProgram();
    if (texture_is_dirty) {
        gl.bindTexture(gl.TEXTURE_2D, color_texture);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0,
            0, 0,
            grid.texture_size, grid.texture_size,
            gl.RGBA, gl.UNSIGNED_BYTE, grid.texture
        );
        texture_is_dirty = false;
    }

    gl.bindVertexArray(vao);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    gl.drawArrays(gl.TRIANGLES, 0, vertex_count);

    requestAnimationFrame(draw);
}