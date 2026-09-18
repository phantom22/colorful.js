    /** buffer used to read from the vertex mask texture. */
let pixel_data = new Uint32Array(1),
    update_view_proj_mat = false,
    /** this is set to true on window.onresize; forces to recalculate the vertex 
     * mask texture during the draw pass. */
    force_render_mask = true,
    /** this is set to true any time that grid.texture or grid.texture_u32view 
     * get modified; forces to update the shader data. */
    texture_is_dirty = false,
    state_is_dirty = false,
    /** when true, considering both mouse and keyboard state, an action is
     * performed (i.e. a verte is clicked or hovered, the grid is filled or
     * cleared); can be set to true only once per frame. */
    request_sample = false,
    /** when true, the grid vertex color lut table will get cleared with grid_bg
     * color (initial grid color). */
    request_clear = false,
    /** current frame id. */
    frame = 0,
    /** used to calculate delta_time. */
    prev_frame_timestamp = 0,
    delta_time = 0,
    window_hidden = false;

function draw(timestamp:number) {
    delta_time = (timestamp - prev_frame_timestamp) * 0.001
    prev_frame_timestamp = timestamp;
    if (window_hidden) {
        requestAnimationFrame(draw);
        return;
    }
    ++frame;

    wheel_already_processed = false;

    if (update_view_proj_mat)
        view_proj_mat =
            create_view_projection_matrix(camera_x, camera_y, camera_scale, ar);

    if (request_clear) {
        fill_grid();
        request_clear = false;
    }

    let source_state_weights: WebGLTexture, source_wcolor_dist: WebGLTexture,
        target_state_weights: WebGLTexture, target_wcolor_dist: WebGLTexture,
        target_fbo: WebGLBuffer;
    if (gpu) {
        if (state_read_index === 0) {
            source_state_weights = state_weights_0;
            source_wcolor_dist = wcolor_dist_0;
            target_fbo = state_fbo1;
            target_state_weights = state_weights_1;
            target_wcolor_dist = wcolor_dist_1;
        }
        else {
            source_state_weights = state_weights_1;
            source_wcolor_dist = wcolor_dist_1;
            target_fbo = state_fbo0;
            target_state_weights = state_weights_0;
            target_wcolor_dist = wcolor_dist_0;
        }
    }

    if (state_is_dirty) {
        gl.bindTexture(gl.TEXTURE_2D, source_state_weights);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,
            grid.texture_size, grid.texture_size,
            gl.RGBA, gl.FLOAT, grid.state_weights);

        gl.bindTexture(gl.TEXTURE_2D, source_wcolor_dist);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,
            grid.texture_size, grid.texture_size,
            gl.RGBA, gl.FLOAT, grid.wcolor_dist);

        state_is_dirty = false;
    }

    // poll previous mouse inputs
    for (let i = 0; i < pbo_count; i++) {
        const sync = syncs[i];
        if (sync) {
            const status = gl.clientWaitSync(sync, 0, 0);
            if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbos[i]);
                gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixel_data);
                
                process_stroke(pixel_data[0]);

                gl.deleteSync(sync);
                syncs[i] = null;
            }
        }
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    if (force_render_mask || request_sample) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);

        if (force_render_mask) {
            mask_p.use_program_and_update_values();
            gl.bindVertexArray(mask_vao);

            gl.viewport(0, 0, width, height);
            gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));

            mask_p.uniforms["u_view_proj"].update_value();
            
            gl.drawArrays(gl.TRIANGLES, 0, vertex_count);

            force_render_mask = false;
        }

        if (request_sample && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
            gl.readBuffer(gl.COLOR_ATTACHMENT0);

            // orphan the buffer before writing to prevent webgl warnings
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbos[pbo_write_index]);
            gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
            gl.readPixels(
                mouse_x, mouse_y, 1, 1,
                gl.RED_INTEGER, gl.UNSIGNED_INT, 0
            );

            if (syncs[pbo_write_index]) gl.deleteSync(syncs[pbo_write_index]);
            syncs[pbo_write_index] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

            pbo_write_index = (pbo_write_index + 1) % pbo_count;

            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
            request_sample = false;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    //////////////////////////////////
    //       STATE PROPAGATION      //
    //////////////////////////////////

    if (gpu) {
        state_p.use_program_and_update_values();

        gl.bindFramebuffer(gl.FRAMEBUFFER, target_fbo);
        gl.viewport(0, 0, grid.texture_size, grid.texture_size);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, color_texture);
        if (texture_is_dirty) {
            gl.texSubImage2D(
                gl.TEXTURE_2D, 0,
                0, 0,
                grid.texture_size, grid.texture_size,
                gl.RGBA, gl.UNSIGNED_BYTE, grid.texture
            );
            texture_is_dirty = false;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source_state_weights);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, source_wcolor_dist);

        gl.bindVertexArray(state_vao);
        gl.disable(gl.BLEND)
        gl.drawArrays(gl.POINTS, 0, grid.triangle_count);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////

    p.use_program_and_update_values();
    if (update_view_proj_mat) {
        p.uniforms["u_view_proj"].update_value();
        update_view_proj_mat = false;
    }

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    if (texture_is_dirty) {
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0,
            0, 0,
            grid.texture_size, grid.texture_size,
            gl.RGBA, gl.UNSIGNED_BYTE, grid.texture
        );
        texture_is_dirty = false;
    }

    if (gpu) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, target_state_weights);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, target_wcolor_dist);

        gl.enable(gl.BLEND);
    }

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, vertex_count);

    if (gpu)
        state_read_index = 1 - state_read_index;
    requestAnimationFrame(draw);
}