function update_viewport() {
    let _width = window.innerWidth,
        _height = window.innerHeight;

    if (_width !== width || _height !== height) {
        width = _width;
        height = _height;
        canvas_el.width = _width;
        canvas_el.height = _height;
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

        ar = _width / _height;
        proj_mat = create_orthographic_matrix(-ar, ar, -1, 1, -1, 1);

        p.useProgram();
        gl.uniformMatrix4fv(p.uniforms["u_proj"], false, proj_mat);
        
        mask_p.useProgram();
        gl.uniformMatrix4fv(mask_p.uniforms["u_proj"], false, proj_mat);

        force_render_mask = true;
        mouse_down = false;
        shift_down = false;
        ctrl_down = false;
        hovered_id = undefined;
    }
}