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

        resize_R32UI_texture(mask_texture, width, height);

        ar = width / height;
        
        update_view_proj_mat = true;
        force_render_mask = true;
        mouse1_down = false;
        shift_down = false;
        ctrl_down = false;
        queued_strokes = [];
        wave_queue.clear();
        hovered_id = undefined;
    }
}