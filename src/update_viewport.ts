/** event called on window.onresize */
function update_viewport() {
    const _width = window.innerWidth,
          _height = window.innerHeight;

    if (_width !== width || _height !== height) {
        canvas_rect = canvas_el.getBoundingClientRect();
        units_per_pixel_x = 2 * camera_scale / canvas_rect.width;        
        units_per_pixel_y = 2 * camera_scale / canvas_rect.height;

        canvas_el.width = width =_width;
        canvas_el.height = height = _height;
        canvas_el.style.width = _width.toString();
        canvas_el.style.height = _height.toString();

        gl.bindTexture(gl.TEXTURE_2D, mask_texture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.R32UI,
            width, height, 0,
            gl.RED_INTEGER, gl.UNSIGNED_INT, null
        );

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        ar = width / height;
        view_proj_mat = create_orthographic_matrix(-ar, ar, -1, 1, -1, 1);

        p.useProgram();
        gl.uniformMatrix4fv(p.uniforms["u_view_proj"], false, view_proj_mat);
        
        mask_p.useProgram();
        gl.uniformMatrix4fv(mask_p.uniforms["u_view_proj"], false, view_proj_mat);

        force_render_mask = true;
        mouse1_down = false;
        shift_down = false;
        ctrl_down = false;
        queued_strokes = [];
        wave_queue.clear();
        hovered_id = undefined;
    }
}