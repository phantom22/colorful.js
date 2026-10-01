/** event called on window.onresize */
function update_viewport() {
    const _width = window.innerWidth,
          _height = window.innerHeight;

    if (_width !== width || _height !== height) {
        canvas_rect = canvas_el.getBoundingClientRect();
        camera.units_per_pixel_x = 2 * camera.scale / canvas_rect.width;        
        camera.units_per_pixel_y = 2 * camera.scale / canvas_rect.height;

        canvas_el.width = width =_width;
        canvas_el.height = height = _height;

        resize_R32UI_texture(mask_texture, width, height);

        camera.ar = width / height;
        
        renderer.update_view_proj_mat = true;
        renderer.force_render_mask = true;
        mouse.m1_down = false;
        keyboard.shift_down = false;
        keyboard.ctrl_down = false;
        stroke.queue = [];
        stroke.flat_queue.clear();
        mouse.last_hovered_id = -1;
    }
}