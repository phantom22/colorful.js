    /** buffer used to read from the vertex mask texture. */
let pixel_data = new Uint32Array(1),
    update_view_proj_mat = false,
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
    /** current frame id. */
    frame = 0,
    /** used to calculate delta_time. */
    prev_frame_timestamp = 0,
    delta_time = 0;

function draw(timestamp:number) {
    ++frame;

    wheel_already_processed = false;
    
    delta_time = (timestamp - prev_frame_timestamp) * 0.001
    prev_frame_timestamp = timestamp;

    if (update_view_proj_mat)
        view_proj_mat = create_view_projection_matrix(
            camera_x, camera_y, camera_scale,
            -ar, ar, -1, 1, -1, 1
        );

    if (request_clear) {
        const clear_color = pack_uint8(grid_bg);
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

        if (force_render_mask) {
            gl.viewport(0, 0, width, height);

            gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));

            mask_p.useProgram();
            gl.uniformMatrix4fv(mask_p.uniforms["u_view_proj"], false, view_proj_mat);

            gl.bindVertexArray(mask_vao);
            gl.drawArrays(gl.TRIANGLES, 0, vertex_count);

            force_render_mask = false;
        }

        if (request_sample && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
            gl.readBuffer(gl.COLOR_ATTACHMENT0);

            const read_index = (write_index + 1) % pbo_count,
                  oldest_sync = syncs[read_index];

            if (oldest_sync) {
                // check status instantly
                const status = gl.clientWaitSync(oldest_sync, 0, 0);
                if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbos[read_index]);
                    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixel_data);
                    process_stroke(pixel_data[0]);

                    gl.deleteSync(oldest_sync);
                    syncs[read_index] = null;
                }
            }

            // orphan the buffer before writing
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbos[write_index]);
            gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
            gl.readPixels(
                mouse_x, mouse_y, 1, 1,
                gl.RED_INTEGER, gl.UNSIGNED_INT, 0
            );

            if (syncs[write_index]) gl.deleteSync(syncs[write_index]);
            syncs[write_index] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

            write_index = (write_index + 1) % pbo_count;

            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
            request_sample = false;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    p.useProgram();
    if (update_view_proj_mat)
        gl.uniformMatrix4fv(p.uniforms["u_view_proj"], false, view_proj_mat);

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

    update_view_proj_mat = false;

    requestAnimationFrame(draw);
}